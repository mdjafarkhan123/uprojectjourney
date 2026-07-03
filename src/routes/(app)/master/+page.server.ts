import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Dashboard data. When logged out, `/master` is the login page, so there is
// nothing to load. When signed in as admin, count this admin's clients via the
// RLS-enforced client (locals.supabase) — RLS scopes the rows to their clients.
export const load: PageServerLoad = async ({ locals }) => {
	// An already-signed-in client has no business on the admin login page — send
	// them to their portal instead of showing the admin form.
	if (locals.user?.role === 'client') {
		redirect(303, '/');
	}

	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return { clientCount: null };
	}

	const { count, error } = await locals.supabase
		.from('users')
		.select('id', { count: 'exact', head: true })
		.eq('role', 'client');

	if (error) {
		console.error('Dashboard client count failed:', error.message);
		return { clientCount: null };
	}

	return { clientCount: count ?? 0 };
};
