---
name: project-tracker
description: Core business rules and object model for the Client Journey platform. Read this FIRST for any feature work; then read only the specific reference file your task needs.
---

# Project Tracker — Core Business Rules

The single source of product intent is `PRODUCT.md` at the repo root. This skill turns that
vision into concrete, enforceable rules. **Never assume schema or auth structure from memory —
read the matching reference file below.**

| Working on...                        | Read this file          |
| ------------------------------------ | ----------------------- |
| Database tables, columns, enums, RLS | `data-model.md`         |
| Login, sessions, route protection    | `auth-sessions.md`      |
| UI look/feel, components, layout     | `../ui-design/SKILL.md` |

---

## What this product is (and is not)

It is a **client-facing project journey platform** — the experience of tracking a package, not a
project-management tool. It is **not** Trello/Jira/Asana. Clients _follow_ progress; they never
_manage_ work.

Every screen must answer four questions at a glance:

1. What is already completed?
2. What is happening right now?
3. What happens next?
4. Is anything waiting on me?

If a feature does not serve one of these, question whether it belongs in V1.

---

## The object model (deliberately tiny)

```
Admin ──owns──▶ Client ──assigned──▶ Project ──has──▶ Milestone ──has──▶ Timeline Update
```

- **Admin** — freelancer/agency owner. Creates and owns clients and projects. Edits everything.
- **Client** — created by an admin, never self-registers. Read-only. Sees only their own projects.
- **Project** — belongs to one admin, assigned to one client. Created from a template.
- **Milestone** — a major phase (Planning, Design, Development, Testing, Launch). Ordered.
- **Timeline Update** — a dated entry inside a milestone. This is the project's history.

Do **not** introduce teams, organizations, workspaces, departments, or role/permission systems.
Two roles only: `admin` and `client`.

---

## Status vocabularies (use these exact values)

**Project status** and **Timeline update status** share one set:

- `planning`, `in_progress`, `waiting_for_client`, `under_review`, `completed`
- plus `not_started` for timeline updates that haven't begun.

**Milestone status:** `not_started`, `open`, `in_progress`, `completed`. Auto-derived from a
milestone's timeline items (adding an item → `open`; any active item → `in_progress`). `completed`
is **bidirectional and automatic**:

- **Up:** when the scope is **finalized** and every item is `completed`, the milestone
  auto-completes.
- **Down (cascade):** setting a milestone to `completed` (the milestones PATCH route) marks **all
  its items** `completed` and progress → 100%.
- **Auto-drop:** reopening any item re-derives the milestone out of `completed` on the next timeline
  change — status always reflects reality (no more "completed sticks forever").

The admin can still override the derived value; that pick persists only until the next timeline
change re-derives it. See `$lib/server/milestone-status.ts`.

`waiting_for_client` is special: whenever it is set, a **Required Action** message must be shown
(e.g. "Please provide your company logo"). The client must always understand _why_ progress paused.

---

## Progress calculation (milestone scope system — see `PLAN.md`)

Progress is **always derived from real completed work**, never hand-entered.

- **Work items** are a milestone's `timeline_updates` rows (its scope checklist).
- **Milestone progress** = `completed items ÷ total items` (an item counts when its
  `status = 'completed'`). Cached in `milestones.progress`, recomputed server-side on every
  item change. There is **no manual progress input**.
- **Milestone scope** has two modes: **Draft** (`scope_finalized = false`) while the checklist
  is still being built, and **Finalized** (`scope_finalized = true`) which locks the checklist
  so only item status can change. "Finalize Scope" ↔ "Edit Scope" toggle it.
- **Milestone weight** (`milestones.weight`, relative, auto-normalized) sets each milestone's
  share of the project total. Weights need not sum to 100.
- **Overall project progress** = weighted, normalized blend of milestone progress. A milestone
  still in **Draft counts as 0%** (its weight stays in the denominator), so the overall number
  only rises as scopes are finalized and items complete. Falls back to equal weighting if all
  weights are 0. Shared math lives in `$lib/progress.ts`.
- Clients never see the word "scope" — they just see the resulting progress and statuses.

---

## What the admin controls

Admins can: edit project info, assign/change the client, choose/modify the template, create /
rename / delete / reorder milestones, add / edit / delete timeline updates, set milestone status,
set start & expected-completion dates, write descriptions, and **decide what the client sees**.

The admin is the only writer. Clients never mutate anything.

---

## Templates

Projects are created from templates (WordPress Business, WooCommerce Store, Landing Page, Website
Redesign, Custom). Choosing a template **seeds the default milestones** at creation time. After
that the project is fully independent — editing it never mutates the template, and vice versa.

---

## V1 scope guardrails

- **No file uploads** except avatars. No documents, no attachments, no image galleries.
- **No notifications / email.** Clients check in by logging in.
- **No password reset, no email verification, no signup.**
- Admin login at `/master`; client login at `/`.

If a request pushes past these, flag it as out of V1 scope before building.
