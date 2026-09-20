-- Resolve UK Portal: tables, access rules and helper functions.
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- It is safe to run again.
--
-- Who can do what:
--   owner   the person who runs the portal. Can edit everything and write messages.
--   client  the person the work is for. Can read everything published and write messages.
--   viewer  can read everything published and cannot write.
-- Nobody without a row in "profiles" can read anything. Sign-ups are switched off in
-- Authentication settings, so only people you create in the dashboard can ever sign in.

-- ---------- people ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  role         text not null check (role in ('owner', 'client', 'viewer')),
  created_at   timestamptz not null default now()
);

-- Helper functions. They run with elevated rights so the access rules below can ask
-- "who is this?" without the rules on "profiles" asking themselves in a loop.
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner', 'client') from public.profiles where id = auth.uid()), false);
$$;

revoke all on function public.my_role(), public.is_member(), public.is_owner(), public.can_write() from public, anon;
grant execute on function public.my_role(), public.is_member(), public.is_owner(), public.can_write() to authenticated;

-- Keeps "updated_at" honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- documents: the blueprint, weekly reports and other pages ----------
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('blueprint', 'weekly', 'page')),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  title        text not null check (char_length(btrim(title)) > 0),
  summary      text,
  body_md      text not null default '',
  pinned       boolean not null default false,
  period_start date,
  period_end   date,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function public.stamp_published()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists documents_stamp_published on public.documents;
create trigger documents_stamp_published before insert or update on public.documents
  for each row execute function public.stamp_published();
drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

-- ---------- questions for the client ----------
create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents (id) on delete set null,
  key         text not null unique check (key ~ '^[a-z0-9-]{1,40}$'),
  prompt      text not null check (char_length(btrim(prompt)) > 0),
  why         text,
  note        text,
  position    integer not null default 0,
  status      text not null default 'open' check (status in ('open', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists questions_touch on public.questions;
create trigger questions_touch before update on public.questions
  for each row execute function public.touch_updated_at();

-- ---------- decisions: made, and still open ----------
create table if not exists public.decisions (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(btrim(title)) > 0),
  detail     text,
  status     text not null default 'open' check (status in ('open', 'decided', 'parked')),
  outcome    text,
  decided_on date,
  needed_by  text,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists decisions_touch on public.decisions;
create trigger decisions_touch before update on public.decisions
  for each row execute function public.touch_updated_at();

-- ---------- updates: one entry per finished major update ----------
create table if not exists public.updates (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) > 0),
  summary     text not null check (char_length(btrim(summary)) > 0),
  details_md  text not null default '',
  released_on date not null default current_date,
  version     text,
  demo_url    text,
  status      text not null default 'published' check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists updates_touch on public.updates;
create trigger updates_touch before update on public.updates
  for each row execute function public.touch_updated_at();

-- ---------- settings: the live prototype address and version ----------
create table if not exists public.settings (
  key        text primary key check (key ~ '^[a-z0-9_]{1,40}$'),
  value      text not null default '',
  updated_at timestamptz not null default now()
);

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------- messages: answers, replies and comments ----------
-- An answer belongs to a question. A comment belongs to a document. A reply belongs to another message.
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid references public.questions (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  parent_id   uuid references public.messages (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id),
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  check (num_nonnulls(question_id, document_id, parent_id) = 1)
);

create index if not exists messages_question_idx on public.messages (question_id);
create index if not exists messages_document_idx on public.messages (document_id);
create index if not exists messages_parent_idx on public.messages (parent_id);

-- One answer per person per question. Changing an answer edits that row.
create unique index if not exists messages_one_answer_per_author
  on public.messages (question_id, author_id) where question_id is not null;

-- An edit may change the words and nothing else.
create or replace function public.messages_guard()
returns trigger language plpgsql as $$
begin
  if new.author_id is distinct from old.author_id
     or new.question_id is distinct from old.question_id
     or new.document_id is distinct from old.document_id
     or new.parent_id is distinct from old.parent_id
     or new.created_at is distinct from old.created_at then
    raise exception 'only the text of a message can be changed';
  end if;
  if new.body is distinct from old.body then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before update on public.messages
  for each row execute function public.messages_guard();

-- ---------- access rules ----------
alter table public.profiles  enable row level security;
alter table public.documents enable row level security;
alter table public.questions enable row level security;
alter table public.decisions enable row level security;
alter table public.updates   enable row level security;
alter table public.settings  enable row level security;
alter table public.messages  enable row level security;

-- Start from nothing (Supabase hands out broad rights to new tables by default), then give back
-- only what is needed. The rules below then decide which rows those rights apply to.
revoke all on public.profiles, public.documents, public.questions, public.decisions,
              public.updates, public.settings, public.messages from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.documents, public.questions, public.decisions,
              public.updates, public.settings to authenticated;
grant select, insert, update on public.messages to authenticated;

-- profiles: any member can see who is who. Nobody can change profiles from the site.
drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated using (public.is_member());

-- documents
drop policy if exists "members read published documents" on public.documents;
create policy "members read published documents" on public.documents
  for select to authenticated using (public.is_member() and (status = 'published' or public.is_owner()));
drop policy if exists "owner writes documents" on public.documents;
create policy "owner writes documents" on public.documents
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- questions
drop policy if exists "members read questions" on public.questions;
create policy "members read questions" on public.questions
  for select to authenticated using (public.is_member());
drop policy if exists "owner writes questions" on public.questions;
create policy "owner writes questions" on public.questions
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- decisions
drop policy if exists "members read decisions" on public.decisions;
create policy "members read decisions" on public.decisions
  for select to authenticated using (public.is_member());
drop policy if exists "owner writes decisions" on public.decisions;
create policy "owner writes decisions" on public.decisions
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- updates
drop policy if exists "members read published updates" on public.updates;
create policy "members read published updates" on public.updates
  for select to authenticated using (public.is_member() and (status = 'published' or public.is_owner()));
drop policy if exists "owner writes updates" on public.updates;
create policy "owner writes updates" on public.updates
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- settings
drop policy if exists "members read settings" on public.settings;
create policy "members read settings" on public.settings
  for select to authenticated using (public.is_member());
drop policy if exists "owner writes settings" on public.settings;
create policy "owner writes settings" on public.settings
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- messages: members read everything. Owner and client can write as themselves, and edit only their own.
drop policy if exists "members read messages" on public.messages;
create policy "members read messages" on public.messages
  for select to authenticated using (public.is_member());

drop policy if exists "writers add their own messages" on public.messages;
create policy "writers add their own messages" on public.messages
  for insert to authenticated
  with check (
    public.can_write()
    and author_id = auth.uid()
    and (question_id is null or exists (select 1 from public.questions q where q.id = question_id and q.status = 'open'))
  );

drop policy if exists "authors edit their own messages" on public.messages;
create policy "authors edit their own messages" on public.messages
  for update to authenticated
  using (author_id = auth.uid() and public.can_write())
  with check (author_id = auth.uid() and public.can_write());
