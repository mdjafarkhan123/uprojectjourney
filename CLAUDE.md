## Project Configuration

- **Product**: Client Journey — a client-facing project journey platform (see `PRODUCT.md`).
- **Language**: TypeScript
- **Framework**: SvelteKit (Svelte 5 runes)
- **Styling**: SCSS + BEM
- **Icons**: RemixIcon (`remixicon`)
- **Backend**: Supabase Postgres via `@supabase/supabase-js` — **no ORM**. Isolation by RLS.
- **Auth**: Custom username/password session auth + minted JWT bridge to RLS (Option B).
- **Package Manager**: npm

> Read `PRODUCT.md` for the full product context whenever you need the "why".

---

## Skills

Domain-specific reference skills live in `.claude/`. **Load only the file your task needs — never
all at once.** Never assume schema, auth, or design structure from memory; read the file first.

### Business & Architecture — `.claude/skills/project-tracker/`

| Working on...                          | Read this file                          |
| -------------------------------------- | --------------------------------------- |
| Business rules, object model, statuses | `project-tracker/SKILL.md` (read first) |
| Database schema, enums, RLS            | `project-tracker/data-model.md`         |
| Login, sessions, route protection      | `project-tracker/auth-sessions.md`      |

### UI Design System — `.claude/`

A complete design system lives at `.claude/SKILL.md` with per-component module files
(`buttons.md`, `cards.md`, `colors.md`, `typography.md`, `modals.md`, etc.). **Read `.claude/SKILL.md`
first, then the specific module(s) your UI touches.** Its tokens are framework-agnostic — implement
them here as **SCSS + BEM** (the modules mention JSX/Tailwind; ignore that and map tokens to SCSS
custom properties). The client portal must also adopt the admin's brand color from `admin_branding`.

---

## MCP Tools

**Svelte MCP** — for any Svelte/SvelteKit work:

- `list-sections` first to discover docs, then `get-documentation` for the relevant sections.
- `svelte-autofixer`: run on every piece of Svelte code you write; keep fixing until it's clean.
- `playground-link`: only after the user asks, and only if the code was NOT written to project files.

**Supabase MCP** — for the database:

- `list_tables` before schema changes; `get_advisors` / `get_logs` when debugging.
- `apply_migration` for schema changes (they hit the remote project — be careful).
- `get_project_url` / `get_publishable_keys` for client config.

---

## Commands

```bash
npm run dev           # start dev server
npm run build         # production build
npm run preview       # preview production build
npm run check         # svelte-kit sync + TypeScript/Svelte type checking
npm run check:watch   # type checking in watch mode
npm run lint          # prettier --check + eslint
npm run format        # prettier --write
```

Migrations are plain SQL applied via the Supabase MCP `apply_migration` (or the Supabase CLI).
There is no Drizzle, no worker process, no outbox.

---

## Non-Negotiable Rules

These are never overridden by a prompt. If a task conflicts with any of these, stop and flag it.
Full patterns live in the skills — these are the guardrails.

1. **Svelte 5 runes only.** No Svelte 4 patterns for any reason. Use SSR + CSR hybrid approach wisely. For CSR use dynamic import, dont import all on first load, just load the shell first so instant render happen. Show loading animation where needs
2. **SCSS + BEM only.** RemixIcon always; **no raw SVG**. Add a toggler for dark mode and Light mode.
3. **Loading state on every async op** (create/read/update/delete) — animated button or popup until
   it resolves. No silent waits.
4. **bits-ui for interactive primitives** (calendar, date/time picker, dropdown, select, dialog…).
   If one doesn't exist, build it accessibly. (bits-ui is not yet installed — get approval first.)
5. **SSR & CSR Hybrid application, performance first.** Don't ship data a page doesn't use. First app load should be SSR. Internal navigation should be CSR like Dahsboard, Clients, Projects etc..., . in CSR routing there would be no DB trip, no server page like '+page.server.ts' or something like this. Pure CSR with Shell render only with loading animation then import/load all data.
6. **Server isolation is absolute.** `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` live only
   in server code (`$lib/server/*`, `hooks.server.ts`, `+server.ts`) — never in `.svelte` or
   `+page.ts`. All writes go through `/api/*`. `$lib/server/*` is never imported in `.svelte` files.
7. **RLS is the real guard.** Every table has RLS enabled; per-request DB access uses the
   RLS-enforced client (`locals.supabase`), not the service role. Service role is only for auth.
8. **Expert engineer mindset.** Think critically, research when needed, prioritize performance,
   avoid overengineering, and design with strong UI/UX thinking from the contractor's perspective.
9. **Match effort to the task — no wasted tokens.**
   - **Trivial / single-file / low-risk** (copy edits, a class tweak, a small UI change, a one-line
     fix): act directly. Don't load skills, don't fan out, don't spawn subagents, don't over-think.
   - **Standard feature work**: load ONLY the one or two skill files the task names — never the
     whole set. Read only files you'll touch or depend on; don't re-read what's already in context.
   - **High-stakes work** (schema/migrations, auth, permissions, RLS/tenant isolation): the ONLY
     tier that justifies deep reading and step-by-step reasoning. Be thorough here.
   - **Stop conditions:** once the path is clear, act. Don't explore "just to be safe" on low-risk
     work. If the user interrupts, treat it as a signal you were over-investigating — switch to acting.
10. **Plain English always.** Lead explanations (problems, plans, errors, architecture) with a
    plain-English summary a non-technical person understands. Define any technical term immediately
    in everyday words. The goal is that the user understands _what_ and _why_, not accepts on faith.
11. **Split work across sessions when it needs.** For a task, if splitting improves
    performance and avoids token waste, split it (1.1, 1.2, …), save the plan + context to memory,
    do each part in a fresh session, and tell the user to start a new session per part. Clear the
    memory once all parts are done.

---

## Implementation Workflow

For any non-trivial task:

1. State your understanding of the task.
2. State your implementation plan.
3. Call out risks and edge cases.
4. **Wait for approval before writing code.**

For trivial tasks (single-file, low-risk): proceed and report after. When in doubt about scope: ask.

---

## During Implementation

- Hit an ambiguity → **stop and ask**; don't pick a path silently.
- Spec conflicts with another document → **flag it**; don't resolve it yourself.
- Task needs a new library → **name options with tradeoffs**, ask before installing.
- Touching auth, database, permissions, or RLS → **confirm approach first**.
- Only modify files directly related to the requested task.

---

## After Implementation

Report every decision made that wasn't explicitly specified, and anything not covered by automated
checks. Then ask: **"Task done. Anything you have in mind?"**

---

## What You Do Not Do

- Don't add features, fields, tables, or abstractions not explicitly requested.
- Don't install packages without approval.
- Don't resolve ambiguities silently — surface them.
- Don't use Svelte 4 patterns for any reason.
- Don't write mutations from `.svelte` files or `+page.ts`.
- Don't expose service-role or JWT-secret credentials in any client-reachable file.
- Don't refactor, rename, or move unrelated code/files during feature work.

---

## Code Quality

- Prefer explicit over clever. No generic builders, factories, or plugin systems. Optimize database
  calls and code for performance.
- No reusable abstractions until duplication is proven across 3+ use cases.
- Every `POST` and `PATCH` route validates its input with **Zod** (not yet installed — add with
  approval when API work begins). Reject invalid data before it touches the database.

---

## Drag-and-Drop (reordering)

Any new sortable list MUST use the shared pieces — do NOT hand-roll a new one:

- **Actions:** `dragHandleZone` + `dragHandle` from `svelte-dnd-action` (a grip handle so row
  clicks/links still work). **Never** the "`dndzone` + toggle `dragDisabled` from an `onmousedown`
  handle" pattern: Svelte 5 delegates `onmousedown` to the app root, so the grab misses on the first
  try (the notorious "works on the 2nd grab / click twice" bug). If you don't need a handle, plain
  `use:dndzone` with the default `dragDisabled: false` (whole-row drag) is also safe.
- **Controller + modal:** every reorder is save-confirmed, never silent. Use
  `createReorderConfirm()` from `$lib/data/reorder.svelte.ts` (owns the pre-drag snapshot, the
  confirm state, and commit-only-after-every-PATCH-succeeds) wired to `<ReorderConfirmModal>`. Rows
  need `{ id: string; position: number }`; the API PATCH takes `{ position }`. See `TemplatesTab.svelte`
  and `settings/templates/[id]/+page.svelte` for reference wiring.
