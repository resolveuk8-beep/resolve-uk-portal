# Resolve UK Portal

A private portal for the **Resolve UK** project, a citizen environmental-reporting
platform for the UK. It gives the client one sign-in-only place to read the
project plan, follow progress, see the latest version of the live prototype, and
answer the questions that need her input.

This repository is the portal only. The Resolve UK reporting app itself lives in
a separate repository.

## What it does

| Page | What it is |
|---|---|
| Overview | The pinned Blueprint, what is waiting for the reader, the prototype, and the latest update and report |
| Blueprint | The system plan, with diagrams, then the questions and a comment thread |
| Progress | A link to the live prototype, and a log with one entry per finished update |
| Weekly reports | One short report each week |
| Questions | Every question in one place, with the answers as they come in |
| Decisions | What has been settled, and what is still open |
| Manage | Owner only: add updates, edit reports and questions, change the prototype details |
| Account | Change password and sign out |

A saved answer replaces its input. A pen icon (or a double-click) edits it, Esc
cancels, and replies appear underneath.

## How it stays private

A static website cannot be private, because anyone can download its files. So the
text is not in the site. It lives in a Supabase Postgres database, and the site
only shows it after someone signs in.

- **Sign-in:** email and password (Supabase Auth), with public sign-up turned off.
- **Access rules:** Row-Level Security in the database returns rows only to people
  who have a profile. Signed-out visitors get nothing.
- **Roles:** `owner`, `client` and `viewer`, each with different write permissions.
- **Keys:** only the public, publishable key is ever used in the site.
- **Tested:** the access rules are checked against a real Postgres copy
  (`supabase/tests/rls.test.mjs`), and the screens are checked in a browser
  against a stand-in database.

## Built with

React 19, TypeScript, Vite, React Router, Supabase (Auth and Postgres),
Markdown rendering with `marked` and `DOMPurify`, and Mermaid for diagrams.
Deployed on Vercel.

## Layout

| Path | What it is |
|---|---|
| `src/` | The React site |
| `src/demo/` | A stand-in database with sample data, used only in demo mode |
| `supabase/` | Database schema, access rules and their tests |
| `content/` | The starting text (Markdown) that is loaded into the database |
| `SETUP.md` | Setup and handover notes |

## Status

A working first version. Setup and day-to-day use are described in
[SETUP.md](SETUP.md).

## License

Copyright (c) 2026 Kay French. All rights reserved.

This repository is public for **viewing only**. No permission is granted to copy,
reproduce, distribute, modify, or use any part of it without prior written
consent. See [LICENSE](LICENSE) for the full terms.
