// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { SessionUser } from '$lib/server/session';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Authenticated user for this request, or null if not signed in. */
			user: SessionUser | null;
			/** RLS-enforced, request-scoped Supabase client (null when unauthenticated). */
			supabase: SupabaseClient<Database> | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
