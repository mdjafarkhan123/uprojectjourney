import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	validateSession,
	mintAccessToken,
	createRequestClient
} from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);

	if (token) {
		const user = await validateSession(token);
		if (user) {
			event.locals.user = user;
			event.locals.supabase = createRequestClient(await mintAccessToken(user));
		} else {
			// Stale or invalid session cookie — clear it.
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
			event.locals.user = null;
			event.locals.supabase = null;
		}
	} else {
		event.locals.user = null;
		event.locals.supabase = null;
	}

	// Route guard: the admin area beyond the login page requires an admin.
	// `/master` itself is the public admin login page.
	const { pathname } = event.url;
	if (pathname.startsWith('/master/') && event.locals.user?.role !== 'admin') {
		redirect(303, '/master');
	}

	return resolve(event);
};
