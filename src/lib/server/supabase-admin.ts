import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { Database } from '$lib/database.types';

/**
 * Service-role Supabase client. BYPASSES RLS — server-only, auth use only
 * (login, session lookup, deactivation, bootstrap). Never import from a
 * `.svelte` file or `+page.ts`. Do not use it for per-request data access;
 * that goes through the request-scoped `locals.supabase` (see hooks.server.ts).
 */
export const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: {
		persistSession: false,
		autoRefreshToken: false
	}
});
