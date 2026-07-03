import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '$env/static/private';
import type { Database } from '$lib/database.types';

/**
 * Anonymous, RLS-enforced Supabase client (carries NO user JWT). Server-only.
 *
 * Used solely for the login-less public journey read, which goes through the
 * `security definer` RPC `get_public_journey`. That RPC is the only anonymous
 * entry point: RLS on the underlying tables stays fully closed, and the RPC is
 * hard-gated on `is_public = true`. This client can therefore never read a
 * private project's rows directly — same guarantee as `locals.supabase`.
 */
export const supabaseAnon = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
	auth: {
		persistSession: false,
		autoRefreshToken: false
	}
});
