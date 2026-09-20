# Setup and handover

Notes for setting up and running the Resolve UK Portal. It holds the Blueprint, a progress log with a link to the live prototype, weekly reports, questions for the client, and a list of decisions. Only people with an account can open it.

## How it stays private

A static website cannot be private, because anyone can download its files. So the text is not in the website. It lives in a Supabase database, and the site only shows it after someone signs in.

- **Sign-in:** email and password (Supabase Auth). Public sign-up is switched off, so only accounts you create can sign in.
- **Database rules (Row-Level Security):** even with a valid login, the database only returns rows to people listed in the `profiles` table. Nobody signed out can read anything.
- **Roles:** `owner` (you: edits everything), `client` (the client: reads, answers, comments), `viewer` (read-only, for people added later).
- **Only the publishable key is in the site.** It is public by design. Never put a `service_role` or secret key in this project.

`supabase/tests/rls.test.mjs` proves these rules on a real Postgres copy (`npm run test:db`).

## One-time setup (about 30 minutes)

Steps marked **You** are yours; nothing here has been run against your Supabase account.

1. **You: make a new Supabase project** just for this portal (not the prototype's). Name it `resolve-uk-portal`, save the database password in a password manager. Region: choose *West EU (London)* if it is listed. The portal only holds plans and the client's answers, no resident data, so the region matters little here.
2. **You: run the database setup.** SQL Editor, New query. Paste all of `supabase/schema.sql`, Run. Then a new query with all of `supabase/seed.sql` (the Blueprint, weekly reports, questions, decisions and updates), Run. Both are safe to run twice.
3. **You: turn off public sign-up.** Authentication, then Sign In / Providers (or Settings), and switch off **Allow new users to sign up**.
4. **You: create the two accounts.** Authentication, Users, Add user, Create new user. Make one for yourself and one for the client's email. Tick **Auto Confirm User**. Use a long password for each (three or four random words is fine).
5. **You: give them access.** Open `supabase/members.sql`, replace the two `REPLACE-WITH-…` emails with the ones you just used, and run it. The check at the bottom must list both people (owner and client).
6. **You: connect the site.** Project Settings, API Keys. Copy the **Project URL** and the **publishable** key. Copy `.env.example` to `.env.local` and paste them in. Run `npm install` then `npm run dev` and sign in as both people to check.
7. **You: put it online.** Create a private GitHub repo and push this folder (you run the git commands). In Vercel, import it, and add the same two values under Settings, Environment Variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Deploy.
8. **You: tell Supabase the address.** Authentication, URL Configuration, set **Site URL** to the Vercel address.
9. **You: hand over the client's login.** Send the link and her email in one message and her password in a different channel. Ask her to change it under her name at the top right, then Change password.

## Looking at it before Supabase exists

```
npm install
npm run dev:demo
```

This opens the portal with sample data and a fake database. Sign in with `kay@example.com`, `ivhel@example.com` or `viewer@example.com`, password `demo`. Nothing is saved, and none of this is included in the real build.

## Your routine after that

- **After each big piece of work:** Manage, Updates, New update. One entry per finished piece, not per step. Then Manage, Prototype, and change the version and date.
- **Each week:** Manage, Documents, open the weekly report, fill the `[…]` placeholders, set Status to Published. Then email the client the short message that goes with it.
- **When the client replies by email instead of in the portal:** Manage, Questions, paste her words into the question's **Answer note**, and set it to Closed.
- **Changing the Blueprint:** Manage, Documents, Blueprint. Use Preview to check it. Diagrams are `mermaid` blocks.
- **Adding a person later:** create the user, then add a `viewer` row (see the bottom of `supabase/members.sql`).

To read the client's answers, just sign in. As owner you see every answer and can reply under it. You can also see them in Supabase, Table Editor, `messages`.

## What is in this folder

| Path | What it is |
| --- | --- |
| `supabase/schema.sql` | Tables, access rules and triggers |
| `supabase/seed.sql` | Starting content (generated from `content/` by `npm run seed`) |
| `supabase/members.sql` | Adds you and the client to the project |
| `supabase/tests/rls.test.mjs` | Checks the access rules on a local Postgres |
| `content/` | The Blueprint and weekly reports as Markdown, plus `seed.json` |
| `src/` | The React site |
| `src/demo/` | The fake database for `dev:demo` |

Edits made in the portal are the real copy. The `content/` files are only the starting text, so do not run `seed.sql` expecting it to overwrite them (it only adds what is missing).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Site against your real Supabase (needs `.env.local`) |
| `npm run dev:demo` | Site with sample data, no Supabase needed |
| `npm run build` | Type-check and build to `dist/` |
| `npm run test:db` | Database access-rule checks |
| `npm run seed` | Rebuild `supabase/seed.sql` from `content/` |

## Later

- The plan says the real reports data should be hosted in the UK before real reports arrive. That is the prototype's database, separate from this one.
- Supabase's free plan pauses a project after about a week without activity and has no backups. Before relying on the portal, move it to a paid plan or open it at least weekly.
- The older static reports sites can be switched off once the client is using this.
