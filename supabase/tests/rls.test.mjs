// Tests the database rules on a local Postgres (PGlite), with a stand-in for Supabase's auth.
// Run with:  npm run test:db
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const here = dirname(fileURLToPath(import.meta.url))
const schemaSql = readFileSync(join(here, '..', 'schema.sql'), 'utf8')

const OWNER = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'
const VIEWER = '33333333-3333-4333-8333-333333333333'
const STRANGER = '44444444-4444-4444-8444-444444444444'

const db = new PGlite()

// Supabase gives the "anon" and "authenticated" roles rights on every new table by default.
// Recreate that first, so the schema has to take the rights away itself.
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`)
await db.exec(schemaSql)
await db.exec(schemaSql) // running it twice must be harmless

await db.exec(`
  insert into auth.users (id, email) values
    ('${OWNER}', 'owner@example.com'), ('${CLIENT}', 'client@example.com'),
    ('${VIEWER}', 'viewer@example.com'), ('${STRANGER}', 'stranger@example.com');
  insert into public.profiles (id, display_name, role) values
    ('${OWNER}', 'Owner', 'owner'), ('${CLIENT}', 'Client', 'client'), ('${VIEWER}', 'Viewer', 'viewer');
  insert into public.documents (id, kind, slug, title, status, body_md) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'blueprint', 'blueprint', 'Blueprint', 'published', 'secret blueprint text'),
    ('aaaaaaaa-0000-4000-8000-000000000002', 'weekly', 'week-9', 'Draft week', 'draft', 'draft text');
  insert into public.questions (id, document_id, key, prompt, status) values
    ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'q1', 'Open question', 'open'),
    ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'q2', 'Closed question', 'closed');
  insert into public.decisions (title) values ('A decision');
  insert into public.updates (title, summary) values ('An update', 'Something changed');
  insert into public.settings (key, value) values ('prototype_url', 'https://example.com');
`)

const DOC = 'aaaaaaaa-0000-4000-8000-000000000001'
const Q1 = 'bbbbbbbb-0000-4000-8000-000000000001'
const Q2 = 'bbbbbbbb-0000-4000-8000-000000000002'

// Run some SQL as a signed-in person (or as the public with no login), inside a transaction that is rolled back.
async function as(who, sql) {
  await db.exec('begin')
  try {
    if (who === 'anon') await db.exec('set local role anon')
    else {
      await db.exec('set local role authenticated')
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who])
    }
    const res = await db.query(sql)
    return { ok: true, rows: res.rows }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  } finally {
    await db.exec('rollback')
  }
}

// Same, but keeps the changes so later steps can build on them.
async function asKeep(who, sql) {
  await db.exec('begin')
  try {
    await db.exec('set local role authenticated')
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who])
    const res = await db.query(sql)
    await db.exec('commit')
    return { ok: true, rows: res.rows }
  } catch (e) {
    await db.exec('rollback')
    return { ok: false, error: String(e.message || e) }
  }
}

let failed = 0
const check = (name, ok, detail) => {
  if (!ok) failed++
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '   -> ' + detail))
}
const denied = (r) => !r.ok && /permission denied|row-level security|violates|only the text|only|cannot|unique/i.test(r.error)
const seesRows = (r) => r.ok && r.rows.length > 0

// ---------- the public, and people without access ----------
for (const t of ['profiles', 'documents', 'questions', 'decisions', 'updates', 'settings', 'messages']) {
  const r = await as('anon', `select * from public.${t}`)
  check(`anon: cannot read ${t}`, !r.ok && /permission denied/.test(r.error), JSON.stringify(r))
}
{
  const r = await as('anon', `select public.is_owner()`)
  check('anon: cannot call the helper functions', !r.ok && /permission denied/.test(r.error), JSON.stringify(r))
}
for (const t of ['documents', 'messages', 'profiles', 'questions', 'decisions', 'updates', 'settings']) {
  const r = await as(STRANGER, `select * from public.${t}`)
  check(`signed in but not invited: sees nothing in ${t}`, r.ok && r.rows.length === 0, JSON.stringify(r))
}
{
  const r = await as(STRANGER, `insert into public.messages (document_id, body) values ('${DOC}', 'hello')`)
  check('signed in but not invited: cannot write a message', denied(r), JSON.stringify(r))
}

// ---------- the client ----------
{
  const r = await as(CLIENT, `select slug, body_md from public.documents order by slug`)
  check('client: reads the published document', r.ok && r.rows.length === 1 && r.rows[0].slug === 'blueprint', JSON.stringify(r))
  check('client: does not see the draft', r.ok && !r.rows.some((x) => x.slug === 'week-9'), JSON.stringify(r))
}
for (const [label, sql] of [
  ['edit a document', `update public.documents set title = 'x' where id = '${DOC}' returning id`],
  ['delete a document', `delete from public.documents where id = '${DOC}' returning id`],
  ['edit a question', `update public.questions set prompt = 'x' where id = '${Q1}' returning id`],
  ['edit a decision', `update public.decisions set title = 'x' returning id`],
  ['edit an update', `update public.updates set title = 'x' returning id`],
  ['change the prototype settings', `update public.settings set value = 'x' returning key`],
  ['make themselves owner', `update public.profiles set role = 'owner' where id = '${CLIENT}' returning id`],
]) {
  const r = await as(CLIENT, sql)
  check(`client: cannot ${label}`, (r.ok && r.rows.length === 0) || denied(r), JSON.stringify(r))
}
{
  const r = await as(CLIENT, `insert into public.documents (kind, slug, title) values ('page', 'sneaky', 'x')`)
  check('client: cannot add a document', denied(r), JSON.stringify(r))
}
{
  const r = await asKeep(CLIENT, `insert into public.messages (question_id, body) values ('${Q1}', 'My answer') returning id, author_id`)
  check('client: can answer an open question, and it is recorded as them', r.ok && r.rows[0].author_id === CLIENT, JSON.stringify(r))
}
{
  const r = await as(CLIENT, `insert into public.messages (question_id, author_id, body) values ('${Q1}', '${OWNER}', 'pretending')`)
  check('client: cannot post as someone else', denied(r), JSON.stringify(r))
}
{
  const r = await as(CLIENT, `insert into public.messages (question_id, body) values ('${Q1}', 'Second answer')`)
  check('client: cannot give a second answer to the same question (edit it instead)', denied(r), JSON.stringify(r))
}
{
  const r = await as(CLIENT, `insert into public.messages (question_id, body) values ('${Q2}', 'Too late')`)
  check('client: cannot answer a closed question', denied(r), JSON.stringify(r))
}
{
  const r = await as(CLIENT, `insert into public.messages (question_id, body) values ('${Q1}', '   ')`)
  check('client: cannot save an empty answer', denied(r), JSON.stringify(r))
}
{
  const r = await as(CLIENT, `insert into public.messages (question_id, document_id, body) values ('${Q1}', '${DOC}', 'both')`)
  check('client: a message must belong to exactly one thing', denied(r), JSON.stringify(r))
}
{
  const r = await asKeep(CLIENT, `update public.messages set body = 'My answer, edited' where question_id = '${Q1}' returning body, updated_at`)
  check('client: can edit their own answer, and the edit is timestamped', r.ok && r.rows[0].body === 'My answer, edited' && r.rows[0].updated_at !== null, JSON.stringify(r))
}
{
  const r = await as(CLIENT, `update public.messages set author_id = '${OWNER}' where question_id = '${Q1}' returning id`)
  check('client: cannot hand their message to someone else', denied(r), JSON.stringify(r))
}
{
  const r = await as(CLIENT, `update public.messages set question_id = '${Q2}' where question_id = '${Q1}' returning id`)
  check('client: cannot move an answer to another question', denied(r), JSON.stringify(r))
}
{
  const r = await as(CLIENT, `delete from public.messages where question_id = '${Q1}' returning id`)
  check('client: cannot delete messages', denied(r), JSON.stringify(r))
}
{
  const r = await asKeep(CLIENT, `insert into public.messages (document_id, body) values ('${DOC}', 'A general comment') returning id`)
  check('client: can leave a general comment on a document', r.ok, JSON.stringify(r))
}

// ---------- the owner ----------
{
  const r = await as(OWNER, `select slug from public.documents order by slug`)
  check('owner: sees drafts as well', r.ok && r.rows.length === 2, JSON.stringify(r))
}
{
  const r = await as(OWNER, `select body from public.messages where question_id = '${Q1}'`)
  check("owner: can read the client's answer", r.ok && r.rows.length === 1, JSON.stringify(r))
}
{
  const ans = await as(OWNER, `select id from public.messages where question_id = '${Q1}'`)
  const answerId = ans.rows[0].id
  const rep = await asKeep(OWNER, `insert into public.messages (parent_id, body) values ('${answerId}', 'Thanks, noted.') returning id, author_id`)
  check('owner: can reply under the answer', rep.ok && rep.rows[0].author_id === OWNER, JSON.stringify(rep))
  const edit = await as(OWNER, `update public.messages set body = 'Rewritten' where id = '${answerId}' returning id`)
  check("owner: cannot rewrite the client's answer", (edit.ok && edit.rows.length === 0) || denied(edit), JSON.stringify(edit))
  const seen = await as(CLIENT, `select body from public.messages where parent_id = '${answerId}'`)
  check("client: sees the owner's reply", seen.ok && seen.rows.length === 1 && seen.rows[0].body === 'Thanks, noted.', JSON.stringify(seen))
}
{
  const r = await asKeep(OWNER, `update public.documents set status = 'published' where slug = 'week-9' returning published_at`)
  check('owner: publishing a draft stamps its published time', r.ok && r.rows[0].published_at !== null, JSON.stringify(r))
}
{
  const r = await asKeep(OWNER, `insert into public.documents (kind, slug, title, body_md) values ('page', 'notes', 'Notes', 'x') returning id`)
  check('owner: can add a document', r.ok, JSON.stringify(r))
  const u = await asKeep(OWNER, `update public.settings set value = 'https://new.example.com' where key = 'prototype_url' returning value`)
  check('owner: can change the prototype address', u.ok && u.rows[0].value === 'https://new.example.com', JSON.stringify(u))
  const q = await asKeep(OWNER, `insert into public.questions (key, prompt) values ('q9', 'Another') returning id`)
  check('owner: can add a question', q.ok, JSON.stringify(q))
  const p = await as(OWNER, `update public.profiles set role = 'client' where id = '${OWNER}' returning id`)
  check('owner: even the owner cannot change roles from the site', denied(p) || (p.ok && p.rows.length === 0), JSON.stringify(p))
}

// ---------- a viewer ----------
{
  const r = await as(VIEWER, `select slug from public.documents`)
  check('viewer: can read published documents', seesRows(r), JSON.stringify(r))
  const w = await as(VIEWER, `insert into public.messages (document_id, body) values ('${DOC}', 'hi')`)
  check('viewer: cannot write', denied(w), JSON.stringify(w))
}

// ---------- people ----------
{
  const r = await as(CLIENT, `select display_name, role from public.profiles order by display_name`)
  check('members can see who is who', r.ok && r.rows.length === 3, JSON.stringify(r))
  const i = await as(OWNER, `insert into public.profiles (id, display_name, role) values ('${STRANGER}', 'Sneaky', 'client')`)
  check('nobody can add a person from the site (only SQL in the dashboard)', denied(i), JSON.stringify(i))
}

console.log(failed === 0 ? '\nAll database checks passed.' : `\n${failed} check(s) FAILED.`)
process.exit(failed === 0 ? 0 : 1)
