import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The signup page is public (reachable when logged out). If an admin who is
// already signed in lands here, send them to their dashboard instead.
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role === 'admin') {
		redirect(303, '/master');
	}
	return {};
};
