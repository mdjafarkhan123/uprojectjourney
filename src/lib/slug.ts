// Public-link slug rules, shared by the sharing UI (PublicShareFields) and the
// project create/availability endpoints so the client and server agree on what a
// valid slug is. The unique index (admin_id, public_slug) remains the authoritative
// guard at write time; these are the format rules layered on top.
//
// Slugs are namespaced per-admin under /p/<username>/<slug>, so a few app-level
// paths are reserved to avoid collisions with real routes.
export const RESERVED_SLUGS = ['master', 'api', 'p', 'journey'];

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

// Lowercase letters/numbers in hyphen-separated groups (no leading/trailing/double hyphen).
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugFormatValid(s: string): boolean {
	return (
		s.length >= SLUG_MIN && s.length <= SLUG_MAX && SLUG_RE.test(s) && !RESERVED_SLUGS.includes(s)
	);
}
