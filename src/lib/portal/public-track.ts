import { browser } from '$app/environment';

// Login-less PUBLIC visit tracking for a shared journey (`/p/[username]/[slug]`).
// Same GA4-style session model as the logged-in portal (see track.ts): a "visit"
// is one whole stay on the shared link — started_at = entry, last_seen_at =
// exit/last activity — recorded as a single portal_views row (source = 'public',
// attributed to the shared project + its owning admin). Navigating from the
// journey to a milestone and back is the SAME visit; it ends on 30-min inactivity,
// tab close, or leaving the link.
//
// Call `startPublicVisitTracking(username, slug)` once from the public SHELL
// layout so it spans the whole visit. It returns a cleanup for the effect. All
// requests go through the anon-backed /api/public/views endpoints and are
// best-effort — a failure never surfaces to the visitor.

const HEARTBEAT_MS = 20_000;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const STORAGE_KEY = 'cj:public-visit';

// Keyed by the shared link so viewing two different public projects in one browser
// never resumes into the wrong project's visit.
type StoredVisit = { viewId: string; key: string; lastActivity: number };

function linkKey(username: string, slug: string): string {
	return `${username.toLowerCase()}/${slug}`;
}

function readStored(): StoredVisit | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<StoredVisit>;
		if (
			parsed &&
			typeof parsed.viewId === 'string' &&
			typeof parsed.key === 'string' &&
			typeof parsed.lastActivity === 'number'
		) {
			return parsed as StoredVisit;
		}
		return null;
	} catch {
		return null;
	}
}

export function startPublicVisitTracking(username: string, slug: string): () => void {
	if (!browser) return () => {};

	const key = linkKey(username, slug);
	let viewId: string | null = null;
	let stopped = false;
	let interval: ReturnType<typeof setInterval> | undefined;

	function persist() {
		if (!viewId) return;
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ viewId, key, lastActivity: Date.now() } satisfies StoredVisit)
			);
		} catch {
			// Storage disabled — tracking still works for this tab via `viewId`.
		}
	}

	async function beat() {
		if (!viewId || document.visibilityState !== 'visible') return;
		try {
			await fetch(`/api/public/views/${viewId}`, { method: 'PATCH' });
			persist();
		} catch {
			// Offline / navigating away — ignore; the next tick retries.
		}
	}

	function onVisibility() {
		if (document.visibilityState === 'visible') void beat();
	}

	function onPageHide() {
		if (!viewId) return;
		// Definitive exit stamp. sendBeacon survives the page unloading (a normal
		// fetch would be cancelled); it can only POST, hence the POST exit route.
		try {
			navigator.sendBeacon(`/api/public/views/${viewId}`);
		} catch {
			// Beacon unsupported/blocked — the last heartbeat is the fallback exit.
		}
		persist();
	}

	(async () => {
		const stored = readStored();
		const now = Date.now();
		if (stored && stored.key === key && now - stored.lastActivity <= SESSION_TIMEOUT_MS) {
			// Resume the live visit — same row, keep bumping last_seen_at.
			viewId = stored.viewId;
			persist();
		} else {
			// Start a fresh visit.
			try {
				const res = await fetch('/api/public/views', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ username, slug })
				});
				if (!res.ok || stopped) return;
				const body = (await res.json()) as { id: string };
				viewId = body.id;
				persist();
			} catch {
				// Tracking must never break the public view — swallow.
				return;
			}
		}
		if (stopped) return;
		// Beat once now so a resumed visit's exit time advances immediately.
		void beat();
		interval = setInterval(beat, HEARTBEAT_MS);
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pagehide', onPageHide);
	})();

	return () => {
		stopped = true;
		if (interval) clearInterval(interval);
		document.removeEventListener('visibilitychange', onVisibility);
		window.removeEventListener('pagehide', onPageHide);
	};
}
