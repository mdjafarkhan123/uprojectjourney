import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// `/master` itself is the public admin login page, so it must stay reachable
// when logged out. Every deeper route is admin-only — belt-and-suspenders with the
// hooks guard. locals.user carries no secrets, so it's safe to hand to the shell.
export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (url.pathname !== '/master' && locals.user?.role !== 'admin') {
		redirect(303, '/master');
	}
	return { user: locals.user };
};
