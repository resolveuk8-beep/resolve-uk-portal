// A stand-in for Supabase that keeps everything in memory. It is only used by `npm run dev:demo`,
// so the portal can be looked at and tried before a real database exists. Nothing typed here is saved.
// It applies the same rules as supabase/schema.sql, in simplified form.
import seed from '../../content/seed.json'
import blueprintMd from '../../content/blueprint.md?raw'
import week1Md from '../../content/week-1.md?raw'
import week2Md from '../../content/week-2.md?raw'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
type Result = { data: any; error: { message: string } | null }

const FILES: Record<string, string> = { 'blueprint.md': blueprintMd, 'week-1.md': week1Md, 'week-2.md': week2Md }

interface DemoUser {
  id: string
  email: string
  password: string
  profile: { id: string; display_name: string; role: 'owner' | 'client' | 'viewer' } | null
}

const USERS: DemoUser[] = [
  { id: 'u-owner', email: 'ivhel@example.com', password: 'demo', profile: { id: 'u-owner', display_name: 'Ivhel', role: 'owner' } },
  { id: 'u-kay', email: 'kay@example.com', password: 'demo', profile: { id: 'u-kay', display_name: 'Kay French', role: 'client' } },
  { id: 'u-viewer', email: 'viewer@example.com', password: 'demo', profile: { id: 'u-viewer', display_name: 'A. Viewer', role: 'viewer' } },
  { id: 'u-nobody', email: 'nobody@example.com', password: 'demo', profile: null },
]

let counter = 0
const uid = (prefix: string) => `${prefix}-${++counter}-${Math.random().toString(36).slice(2, 8)}`
const now = () => new Date().toISOString()
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

function buildTables(): Record<string, Row[]> {
  const t: Record<string, Row[]> = { profiles: [], documents: [], questions: [], decisions: [], updates: [], settings: [], messages: [] }
  t.profiles = USERS.filter((u) => u.profile).map((u) => ({ ...u.profile }))

  for (const d of seed.documents as Row[]) {
    t.documents.push({
      id: uid('d'), kind: d.kind, slug: d.slug, title: d.title, summary: d.summary ?? null, body_md: FILES[d.file].trim() + '\n',
      pinned: !!d.pinned, period_start: d.period_start ?? null, period_end: d.period_end ?? null, status: d.status,
      published_at: d.published_at ?? (d.status === 'published' ? now() : null), created_at: now(), updated_at: now(),
    })
  }
  for (const q of seed.questions as Row[]) {
    const doc = t.documents.find((d) => d.slug === q.document)
    t.questions.push({
      id: uid('q'), document_id: doc?.id ?? null, key: q.key, prompt: q.prompt, why: q.why ?? null, note: q.note ?? null,
      position: q.position ?? 0, status: q.status ?? 'open', created_at: now(), updated_at: now(),
    })
  }
  for (const d of seed.decisions as Row[]) {
    t.decisions.push({
      id: uid('c'), title: d.title, detail: d.detail ?? null, status: d.status, outcome: d.outcome ?? null,
      decided_on: d.decided_on ?? null, needed_by: d.needed_by ?? null, position: d.position ?? 0, created_at: now(), updated_at: now(),
    })
  }
  for (const u of seed.updates as Row[]) {
    t.updates.push({
      id: uid('u'), title: u.title, summary: u.summary, details_md: u.details_md ?? '', released_on: u.released_on,
      version: u.version ?? null, demo_url: u.demo_url ?? null, status: u.status ?? 'published', created_at: now(), updated_at: now(),
    })
  }
  for (const [key, value] of Object.entries(seed.settings as Record<string, string>)) {
    t.settings.push({ key, value, updated_at: now() })
  }

  // A little sample conversation, so the design can be judged with something in it.
  const q4 = t.questions.find((q) => q.key === 'q4')
  const bp = t.documents.find((d) => d.slug === 'blueprint')
  if (q4 && bp) {
    const answer = { id: uid('m'), question_id: q4.id, document_id: null, parent_id: null, author_id: 'u-kay', body: 'Five sounds about right to start with, but I would want to see how it works in practice before we fix it.', created_at: hoursAgo(5), updated_at: null }
    t.messages.push(answer)
    t.messages.push({ id: uid('m'), question_id: null, document_id: null, parent_id: answer.id, author_id: 'u-owner', body: "Thanks, I'll size the pilot on five and we can change it once we've seen real reports.", created_at: hoursAgo(3), updated_at: null })
    t.messages.push({ id: uid('m'), question_id: null, document_id: bp.id, parent_id: null, author_id: 'u-kay', body: 'This is clear. Thank you.', created_at: hoursAgo(4), updated_at: null })
  }
  return t
}

export function createDemoClient() {
  let db = buildTables()
  const listeners = new Set<(event: string, session: any) => void>()

  const stored = (): DemoUser | null => {
    const id = sessionStorage.getItem('demo_user')
    return USERS.find((u) => u.id === id) ?? null
  }
  const sessionOf = (u: DemoUser | null) => (u ? { access_token: 'demo', user: { id: u.id, email: u.email } } : null)
  const me = () => stored()
  const role = () => me()?.profile?.role ?? null
  const isMember = () => role() !== null
  const isOwner = () => role() === 'owner'
  const canWrite = () => role() === 'owner' || role() === 'client'
  const rls = (table: string) => ({ message: `new row violates row-level security policy for table "${table}"` })

  const CONTENT = ['documents', 'questions', 'decisions', 'updates', 'settings']

  class Query implements PromiseLike<Result> {
    private filters: Array<[string, unknown]> = []
    private orders: Array<[string, boolean]> = []
    private max: number | null = null
    private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
    private payload: any = null
    private one: 'none' | 'maybe' | 'single' = 'none'
    private returning = false
    private table: string
    constructor(table: string) { this.table = table }

    select() { this.returning = true; return this }
    eq(col: string, value: unknown) { this.filters.push([col, value]); return this }
    order(col: string, opts?: { ascending?: boolean }) { this.orders.push([col, opts?.ascending !== false]); return this }
    lim(n: number) { this.max = n; return this }
    maybeSingle() { this.one = 'maybe'; return this }
    single() { this.one = 'single'; return this }
    insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = rows; return this }
    update(patch: Row) { this.op = 'update'; this.payload = patch; return this }
    upsert(rows: Row | Row[]) { this.op = 'upsert'; this.payload = rows; return this }
    delete() { this.op = 'delete'; return this }

    then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
      return new Promise<Result>((resolve) => setTimeout(() => resolve(this.run()), 20)).then(ok, bad)
    }

    private matches(row: Row) { return this.filters.every(([c, v]) => row[c] === v) }

    private visible(): Row[] {
      if (!isMember()) return []
      const rows = db[this.table]
      if (this.table === 'documents' || this.table === 'updates') return rows.filter((r) => r.status === 'published' || isOwner())
      return rows
    }

    private shape(rows: Row[]): Result {
      let out = rows.map(clone)
      for (const [c, asc] of [...this.orders].reverse()) {
        out = out.sort((a, b) => (a[c] === b[c] ? 0 : (a[c] ?? '') > (b[c] ?? '') ? (asc ? 1 : -1) : asc ? -1 : 1))
      }
      if (this.max != null) out = out.slice(0, this.max)
      if (this.one === 'none') return { data: out, error: null }
      if (out.length === 0) return { data: null, error: this.one === 'single' ? { message: 'no rows returned' } : null }
      return { data: out[0], error: null }
    }

    private run(): Result {
      const table = this.table
      if (!db[table]) return { data: null, error: { message: `unknown table ${table}` } }
      if (this.op === 'select') return this.shape(this.visible().filter((r) => this.matches(r)))

      if (this.op === 'insert' || this.op === 'upsert') {
        const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload]
        const made: Row[] = []
        for (const input of list) {
          const row = { ...input }
          if (CONTENT.includes(table)) {
            if (!isOwner()) return { data: null, error: rls(table) }
            if (this.op === 'upsert' && table === 'settings') {
              const existing = db.settings.find((r) => r.key === row.key)
              if (existing) { existing.value = row.value; existing.updated_at = now(); made.push(existing); continue }
            }
            row.id = row.id ?? (table === 'settings' ? undefined : uid(table[0]))
            if (table === 'settings') row.updated_at = now()
            else { row.created_at = now(); row.updated_at = now() }
            if (table === 'documents' && row.status === 'published' && !row.published_at) row.published_at = now()
            if (table === 'documents') { row.pinned = !!row.pinned; row.body_md = row.body_md ?? '' }
            if (table === 'updates') { row.details_md = row.details_md ?? ''; row.status = row.status ?? 'published'; row.released_on = row.released_on ?? now().slice(0, 10) }
            if (table === 'questions') { row.status = row.status ?? 'open'; row.position = row.position ?? 0 }
            if (table === 'decisions') { row.status = row.status ?? 'open'; row.position = row.position ?? 0 }
            if (table === 'documents' && db.documents.some((d) => d.slug === row.slug)) return { data: null, error: { message: 'duplicate key value violates unique constraint "documents_slug_key"' } }
            if (table === 'questions' && db.questions.some((q) => q.key === row.key)) return { data: null, error: { message: 'duplicate key value violates unique constraint "questions_key_key"' } }
          } else if (table === 'messages') {
            if (!canWrite()) return { data: null, error: rls(table) }
            row.author_id = row.author_id ?? me()!.id
            if (row.author_id !== me()!.id) return { data: null, error: rls(table) }
            const parents = [row.question_id, row.document_id, row.parent_id].filter((v) => v != null).length
            if (parents !== 1) return { data: null, error: { message: 'new row for relation "messages" violates check constraint "messages_check"' } }
            if (typeof row.body !== 'string' || row.body.trim().length < 1 || row.body.length > 4000) return { data: null, error: { message: 'new row for relation "messages" violates check constraint "messages_body_check"' } }
            if (row.question_id) {
              const q = db.questions.find((x) => x.id === row.question_id)
              if (!q || q.status !== 'open') return { data: null, error: rls(table) }
              if (db.messages.some((m) => m.question_id === row.question_id && m.author_id === row.author_id)) return { data: null, error: { message: 'duplicate key value violates unique constraint "messages_one_answer_per_author"' } }
            }
            row.id = uid('m'); row.created_at = now(); row.updated_at = null
            row.question_id = row.question_id ?? null; row.document_id = row.document_id ?? null; row.parent_id = row.parent_id ?? null
          } else {
            return { data: null, error: { message: `permission denied for table ${table}` } }
          }
          db[table].push(row)
          made.push(row)
        }
        return this.returning ? this.shape(made) : { data: null, error: null }
      }

      const targets = db[table].filter((r) => this.matches(r) && (table === 'messages' || table === 'profiles' || isOwner() || !CONTENT.includes(table)))

      if (this.op === 'update') {
        if (CONTENT.includes(table) && !isOwner()) return { data: null, error: null }
        if (table === 'profiles') return { data: null, error: { message: 'permission denied for table profiles' } }
        const changed: Row[] = []
        for (const row of targets) {
          if (table === 'messages') {
            if (row.author_id !== me()?.id || !canWrite()) continue
            for (const k of Object.keys(this.payload)) {
              if (k !== 'body') return { data: null, error: { message: 'only the text of a message can be changed' } }
            }
            const body = this.payload.body
            if (typeof body !== 'string' || body.trim().length < 1 || body.length > 4000) return { data: null, error: { message: 'new row for relation "messages" violates check constraint "messages_body_check"' } }
            if (body !== row.body) row.updated_at = now()
            row.body = body
          } else {
            Object.assign(row, this.payload)
            row.updated_at = now()
            if (table === 'documents' && row.status === 'published' && !row.published_at) row.published_at = now()
          }
          changed.push(row)
        }
        return this.returning ? this.shape(changed) : { data: null, error: null }
      }

      if (this.op === 'delete') {
        if (table === 'messages' || table === 'profiles') return { data: null, error: { message: `permission denied for table ${table}` } }
        if (!isOwner()) return { data: null, error: null }
        db[table] = db[table].filter((r) => !targets.includes(r))
        if (table === 'documents') {
          const gone = new Set(targets.map((t) => t.id))
          db.messages = db.messages.filter((m) => !gone.has(m.document_id))
          db.questions.forEach((q) => { if (gone.has(q.document_id)) q.document_id = null })
        }
        return { data: null, error: null }
      }
      return { data: null, error: { message: 'unsupported' } }
    }
  }

  const client = {
    from(table: string) {
      const q = new Query(table)
      // "limit" is a reserved word on the class, so expose the query method under its real name
      return Object.assign(q, { limit: (n: number) => q.lim(n) })
    },
    auth: {
      async getSession() { return { data: { session: sessionOf(stored()) }, error: null } },
      onAuthStateChange(cb: (event: string, session: any) => void) {
        listeners.add(cb)
        setTimeout(() => cb('INITIAL_SESSION', sessionOf(stored())), 0)
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        await new Promise((r) => setTimeout(r, 120))
        const user = USERS.find((u) => u.email === email.trim().toLowerCase() && u.password === password)
        if (!user) return { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } }
        sessionStorage.setItem('demo_user', user.id)
        const session = sessionOf(user)
        listeners.forEach((l) => l('SIGNED_IN', session))
        return { data: { session, user: session!.user }, error: null }
      },
      async signOut() {
        sessionStorage.removeItem('demo_user')
        listeners.forEach((l) => l('SIGNED_OUT', null))
        return { error: null }
      },
      async updateUser({ password }: { password: string }) {
        if (!stored()) return { data: null, error: { message: 'Not signed in' } }
        if (password.length < 10) return { data: null, error: { message: 'Password should be at least 10 characters.' } }
        return { data: { user: {} }, error: null }
      },
    },
  }

  ;(window as any).__demoDb = {
    reset() { db = buildTables() },
    rows: (table: string) => clone(db[table]),
    insert: (table: string, row: Row) => { db[table].push(row) },
  }
  return client
}
