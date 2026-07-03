import { json, type RequestHandler } from '@sveltejs/kit';

// Dashboard stats, fetched client-side (CSR) so the page renders its shell +
// skeleton instantly and fills in after hydration. Reads go through the
// RLS-enforced client, so the count is already scoped to this admin's clients.
export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const { count, error } = await locals.supabase
		.from('users')
		.select('id', { count: 'exact', head: true })
		.eq('role', 'client');

	if (error) {
		console.error('[dashboard] client count failed:', error.message);
		return json({ message: 'Could not load dashboard.' }, { status: 500 });
	}

	return json({ clientCount: count ?? 0 });
};
