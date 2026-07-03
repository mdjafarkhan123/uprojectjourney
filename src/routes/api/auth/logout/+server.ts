import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteSession, SESSION_COOKIE } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) {
		await deleteSession(token).catch(() => {
			// Session may already be gone; clearing the cookie is enough.
		});
		cookies.delete(SESSION_COOKIE, { path: '/' });
	}
	return json({ ok: true });
};
