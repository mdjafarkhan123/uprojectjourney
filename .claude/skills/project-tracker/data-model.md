---
name: project-tracker-data-model
description: Supabase Postgres schema, enums, relationships, and Row-Level Security strategy for Project Tracker. Read before any migration or database query.
---

# Data Model & RLS

Backend is **Supabase Postgres accessed via `@supabase/supabase-js`**. There is **no ORM**
(no Drizzle). Migrations are plain SQL applied via the Supabase MCP `apply_migration` /
Supabase CLI. Isolation is enforced by **Row-Level Security (RLS)** — see the bottom section.

> This file describes the intended schema. The actual migrations are written only after an
> approved implementation plan. Keep this file in sync when the schema changes.

---

## Enums

```sql
create type user_role   as enum ('admin', 'client');
create type user_status as enum ('active', 'inactive');
create type project_status   as enum ('planning','in_progress','waiting_for_client','under_review','completed');
create type milestone_status  as enum ('not_started','open','in_progress','completed');
create type timeline_status   as enum ('not_started','in_progress','waiting_for_client','under_review','completed');
```

---

## Tables

### `users`

Single table for both roles (one place to look up a login).

| column         | type        | notes                                                |
| -------------- | ----------- | ---------------------------------------------------- |
| id             | uuid pk     | `default gen_random_uuid()`                          |
| role           | user_role   | `admin` or `client`                                  |
| owner_admin_id | uuid null   | for clients: the admin who owns them; null for admin |
| username       | text unique | login handle (clients log in by username)            |
| password_hash  | text        | Argon2id hash — never the raw password               |
| full_name      | text        |                                                      |
| avatar_url     | text null   | only upload type allowed in V1                       |
| status         | user_status | deactivating a client kills their sessions           |
| created_at     | timestamptz | `default now()`                                      |

### `admin_branding`

One row per admin. Client portal reflects the owning admin's branding.

| column        | type             | notes             |
| ------------- | ---------------- | ----------------- |
| admin_id      | uuid pk fk→users | on delete cascade |
| company_name  | text null        |                   |
| logo_url      | text null        |                   |
| primary_color | text null        | hex string        |
| updated_at    | timestamptz      |                   |

### `projects`

| column                 | type           | notes                                    |
| ---------------------- | -------------- | ---------------------------------------- |
| id                     | uuid pk        |                                          |
| admin_id               | uuid fk→users  | owner                                    |
| client_id              | uuid fk→users  | assigned client                          |
| name                   | text           |                                          |
| project_type           | text null      | free text / from template                |
| template_key           | text null      | which template seeded it (for reference) |
| status                 | project_status |                                          |
| expected_delivery_date | date null      |                                          |
| current_focus_title    | text null      | admin-controlled "Current Focus"         |
| current_focus_goal     | text null      | admin-controlled "Today's Goal"          |
| created_at             | timestamptz    |                                          |
| updated_at             | timestamptz    |                                          |

Derived (do **not** store): overall progress, latest update, next step, current milestone.
Compute these from `milestones` / `timeline_updates` at read time.

### `milestones`

| column                   | type             | notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                       | uuid pk          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| project_id               | uuid fk→projects | on delete cascade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| name                     | text             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| status                   | milestone_status |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| progress                 | int              | 0–100. **Derived, not hand-entered** — a server-computed cache of `completed items ÷ total items` (see below). Recomputed on every item change and on Finalize.                                                                                                                                                                                                                                                                                                                                                                     |
| weight                   | numeric          | `not null default 1`, `check (weight >= 0)`. A milestone's **% share** of overall project progress. Set together for all a project's milestones via the "Adjust weights" editor (`PATCH /api/projects/[id]/weights`), which enforces whole numbers summing to **exactly 100**. The progress math still normalizes, so data that has drifted off 100 (e.g. right after adding/deleting a milestone, or legacy rows all at `1`) never breaks the overall % — the project page just shows a soft "adjust" nudge until it's rebalanced. |
| scope_finalized          | boolean          | `not null default false`. Draft (false) = the work-item checklist is still being built and freely edited. Finalized (true) = checklist is locked; only item **status** may change. Toggled by "Finalize Scope" / "Edit Scope".                                                                                                                                                                                                                                                                                                      |
| position                 | int              | ordering; reorder updates this                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| start_date               | date null        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| expected_completion_date | date null        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| overview                 | text null        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| created_at               | timestamptz      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| updated_at               | timestamptz      | `not null default now()`. "Last activity" — bumped by a `before update` trigger, **and** freshened whenever any of its `timeline_updates` is inserted/edited/deleted (parent-touch trigger). The client portal reads this as the milestone's "Updated" time.                                                                                                                                                                                                                                                                        |

**Work items = `timeline_updates`.** A milestone's `timeline_updates` rows double as its
"work items": the scope checklist that drives progress. Milestone `progress` = the share of
those rows whose `status = 'completed'`. While `scope_finalized = false`, items can be added /
edited / deleted; once finalized, the API rejects add/delete and restricts edits to `status`
(and its dependent `required_action`). The lock is enforced in the API routes
(`/api/timeline-updates*`, `/api/milestones/[id]`), not RLS.

### `timeline_updates`

| column          | type               | notes                                                                                                       |
| --------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| id              | uuid pk            |                                                                                                             |
| milestone_id    | uuid fk→milestones | on delete cascade                                                                                           |
| title           | text               |                                                                                                             |
| description     | text null          |                                                                                                             |
| status          | timeline_status    |                                                                                                             |
| required_action | text null          | required when status = `waiting_for_client`                                                                 |
| entry_date      | date               | the date shown on the timeline                                                                              |
| created_at      | timestamptz        |                                                                                                             |
| updated_at      | timestamptz        | `not null default now()`; bumped on every edit (trigger). Also touches the parent milestone's `updated_at`. |

### `sessions`

Custom session store (see `auth-sessions.md`). Enables instant revocation.

| column     | type          | notes                              |
| ---------- | ------------- | ---------------------------------- |
| id         | uuid pk       |                                    |
| token_hash | text unique   | SHA-256 of the opaque cookie token |
| user_id    | uuid fk→users | on delete cascade                  |
| expires_at | timestamptz   |                                    |
| created_at | timestamptz   |                                    |

Templates are **seed data**, not a runtime dependency: keep template definitions (name +
default milestone list) in a seed migration or a server constant, and copy them into
`milestones` when a project is created.

---

## Row-Level Security (Option B — true RLS via minted JWTs)

Every request from a logged-in user reaches Supabase with a **JWT signed using the Supabase JWT
secret**, carrying claims: `sub` = the user's id, and `user_role` = `admin`|`client`. RLS reads
these to enforce access **in the database**, independent of app code.

- **Enable RLS on every table.** No table is left open.
- Login/session management (reading `users` to verify a password, writing `sessions`) runs with the
  **service role key** on the server only — it bypasses RLS and is never reachable from the client.

Helper (reads the custom claim):

```sql
create or replace function auth.user_role() returns text
language sql stable as $$ select coalesce(auth.jwt() ->> 'user_role', '') $$;
```

Policy intent per table:

- **users** — admin: full access to rows where `owner_admin_id = auth.uid()` (their clients) and to
  their own row (`id = auth.uid()`). client: `select` own row only.
- **admin_branding** — admin: manage own row (`admin_id = auth.uid()`). client: `select` the row of
  their owning admin so the portal can brand itself.
- **projects** — admin: full access where `admin_id = auth.uid()`. client: `select` where
  `client_id = auth.uid()`.
- **milestones / timeline_updates** — access follows the parent project: allowed if the row's
  project is visible to the caller under the `projects` rules. client is `select`-only.
- **sessions** — no policies for `authenticated`/`anon` (deny all); managed only via service role.

Because RLS is the real guard, a bug in app code cannot leak one client's data to another.
