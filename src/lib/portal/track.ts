import { browser } from '$app/environment';

// Client-portal VISIT tracking (GA4-style sessions). A "visit" is one whole stay in
// the portal — from entering until they leave — recorded as a single portal_views
// row: started_at = entry, last_seen_at = exit/last activity. Navigating around the
// portal during the visit is the SAME visit; it stays alive across page changes and
// tab switches while active, and ends on 30-min inactivity, tab close, or logout.
//
// Call `startVisitTracking(userId)` once from the portal SHELL layout (so it spans
// the whole visit, not one page). It returns a cleanup for the effect. Continuity
// across page loads is held in localStorage: if a live visit for THIS user is still
// within the 30-min window we resume it; otherwise we start a new one. Everything is
// best-effort — a failed request never surfaces to the client.

const HEARTBEAT_MS = 20_000;
// GA4 industry-standard session timeout: a gap of >30 min of inactivity ends the
// visit; returning after that starts a new one.
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const STORAGE_KEY = 'cj:portal-visit';

type StoredVisit = { viewId: string; userId: string; lastActivity: number };

function readStored(): StoredVisit | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<StoredVisit>;
		if (
			parsed &&
			typeof parsed.viewId === 'string' &&
			typeof parsed.userId === 'string' &&
			typeof parsed.lastActivity === 'number'
		) {
			return parsed as StoredVisit;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Clear the stored visit. Call on logout so a NEXT login in this browser (possibly a
 * different user) never resumes into the previous visit. The userId guard in
 * `startVisitTracking` is the belt-and-suspenders backup for this.
 */
export function clearVisitTracking(): void {
	if (!browser) return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Storage disabled — nothing to clear.
	}
}

export function startVisitTracking(userId: string): () => void {
	if (!browser) return () => {};

	let viewId: string | null = null;
	let stopped = false;
	let interval: ReturnType<typeof setInterval> | undefined;

	function persist() {
		if (!viewId) return;
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ viewId, userId, lastActivity: Date.now() } satisfies StoredVisit)
			);
		} catch {
			// Storage disabled — tracking still works for this tab via `viewId`.
		}
	}

	async function beat() {
		if (!viewId || document.visibilityState !== 'visible') return;
		try {
			await fetch(`/api/portal/views/${viewId}`, { method: 'PATCH' });
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
			navigator.sendBeacon(`/api/portal/views/${viewId}`);
		} catch {
			// Beacon unsupported/blocked — the last heartbeat is the fallback exit.
		}
		persist();
	}

	(async () => {
		const stored = readStored();
		const now = Date.now();
		if (stored && stored.userId === userId && now - stored.lastActivity <= SESSION_TIMEOUT_MS) {
			// Resume the live visit — same row, keep bumping last_seen_at.
			viewId = stored.viewId;
			persist();
		} else {
			// Start a fresh visit.
			try {
				const res = await fetch('/api/portal/views', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: '{}'
				});
				if (!res.ok || stopped) return;
				const body = (await res.json()) as { id: string };
				viewId = body.id;
				persist();
			} catch {
				// Tracking must never break the portal — swallow.
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
