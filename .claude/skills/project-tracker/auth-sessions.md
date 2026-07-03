---
name: project-tracker-auth-sessions
description: Custom username/password session auth and the JWT bridge that powers RLS. Read before touching login, logout, session handling, or protected routes.
---

# Auth & Sessions (Custom + RLS Bridge)

V1 auth is **intentionally simple**: no signup, no email verification, no password reset. Admins are
created manually; admins create clients from inside the app. Clients log in by **username**, not
email — which is why we do **not** use Supabase Auth. We run our own session layer and bridge it to
the database with a minted JWT so RLS still enforces isolation (see `data-model.md`).

> Prerequisite before implementing: obtain the project's **Supabase JWT secret** (HS256) and store
> it as `SUPABASE_JWT_SECRET` (server env). Also `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
> `SUPABASE_SERVICE_ROLE_KEY`. Confirm the project accepts HS256 tokens signed with the legacy JWT
> secret; if it only uses asymmetric signing keys, adjust the minting step accordingly.

---

## Login endpoints

- **Admin:** `/master` (login page + `POST /api/auth/login` with `role=admin` intent).
- **Client:** `/` (login page + same login API with `role=client` intent).

The flow (both roles):

1. `POST /api/auth/login` with `{ username, password }`.
2. Server, using the **service role** client, looks up the user by username, checks `status =
'active'`, and verifies the password with **Argon2id**.
3. On success: generate a random 256-bit token, store `sha256(token)` in `sessions` with an
   `expires_at`, and set the raw token in an **httpOnly, secure, SameSite=Lax** cookie.
4. Redirect: admin → `/master` dashboard; client → `/` project list.

Never return the password hash or session internals to the client. Always show a loading state on
the login button while the request is in flight (non-negotiable rule 3).

---

## Session validation & the JWT bridge (`hooks.server.ts`)

On every request:

1. Read the session cookie; if present, look up `sessions` by `sha256(token)` (service role),
   check `expires_at` and that the user is still `active`.
2. Attach `event.locals.user = { id, role, ... }`.
3. **Mint a short-lived JWT** signed with `SUPABASE_JWT_SECRET`, containing:
   - `sub`: the user id
   - `role`: `authenticated` (the Postgres role Supabase expects)
   - `user_role`: `admin` | `client` (custom claim RLS reads)
   - short `exp` (e.g. a few minutes)
4. Create a **request-scoped** Supabase client whose `Authorization` header carries that JWT, and
   attach it as `event.locals.supabase`. All RLS-enforced reads/writes use this client.

Keep a **separate** service-role client in `$lib/server/supabase-admin.ts` used only for auth
(login, session lookup, deactivation). It bypasses RLS, so it must never be reachable from the
browser.

---

## Route protection

- `/master/**` requires `locals.user?.role === 'admin'`; otherwise redirect to `/master`
  login.
- Authenticated client area under `/` requires `locals.user?.role === 'client'`; otherwise redirect
  to the client login.
- `load` functions and `/api/*` routes read `locals.user` to authorize, and use `locals.supabase`
  for data so RLS is the backstop even if an app-level check is missed.

---

## Deactivation & logout

- **Deactivate client:** set `users.status = 'inactive'` and delete that user's `sessions` rows —
  access is revoked immediately on the next request.
- **Logout:** delete the session row and clear the cookie.

---

## Hard rules (from CLAUDE.md, restated here)

- `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` live only in server code
  (`$lib/server/*`, `hooks.server.ts`, `+server.ts`). Never in `.svelte` or `+page.ts`.
- All writes go through `/api/*`. No mutations from `.svelte` files or `+page.ts`.
- Every `POST`/`PATCH` validates its body with **Zod** before touching the database.
