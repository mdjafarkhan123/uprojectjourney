import { browser } from '$app/environment';

/**
 * Tiny stale-while-revalidate (SWR) data layer for the client-rendered parts of
 * the app. Goals (per product direction):
 *
 *  - Revisiting a page shows cached data instantly — no skeleton, no refetch —
 *    as long as the cache is fresh.
 *  - When stale, data still renders instantly and revalidates in the background.
 *  - A successful create/update patches the cache immediately, so the UI reflects
 *    changes at once without waiting for a round-trip.
 *
 * The registry is intentionally module-level so it survives client-side
 * navigation (that IS the cache). On the server we never touch the registry —
 * module state is shared across requests there, so caching per-user data would
 * leak between users. During SSR we return a throwaway resource with no data,
 * which renders the skeleton; the real fetch happens after hydration.
 */

const DEFAULT_STALE_MS = 30_000;

export class Resource<T> {
	data = $state<T | undefined>(undefined);
	error = $state<string | null>(null);
	loading = $state(false);
	fetchedAt = $state(0);

	#fetcher: () => Promise<T>;
	#inflight: Promise<void> | null = null;

	constructor(fetcher: () => Promise<T>) {
		this.#fetcher = fetcher;
	}

	/**
	 * Fetch (or revalidate) the resource. In-flight requests are de-duplicated.
	 * `loading` is only raised when there's nothing to show yet, so a background
	 * revalidation never flashes a skeleton over existing data.
	 */
	load(): Promise<void> {
		if (this.#inflight) return this.#inflight;

		this.loading = this.data === undefined;
		this.error = null;

		this.#inflight = (async () => {
			try {
				const result = await this.#fetcher();
				this.data = result;
				this.fetchedAt = Date.now();
			} catch (err) {
				this.error = err instanceof Error ? err.message : 'Something went wrong.';
			} finally {
				this.loading = false;
				this.#inflight = null;
			}
		})();

		return this.#inflight;
	}

	/** Patch the cached value in place (e.g. after a successful mutation). */
	set(updater: (current: T | undefined) => T): void {
		this.data = updater(this.data);
		this.fetchedAt = Date.now();
	}
}

// A plain Map is intentional here: the registry is a non-reactive lookup —
// reactivity lives in each Resource's $state fields, not in the map itself.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const registry = new Map<string, Resource<unknown>>();

function getResource<T>(key: string, fetcher: () => Promise<T>): Resource<T> {
	let resource = registry.get(key) as Resource<T> | undefined;
	if (!resource) {
		resource = new Resource<T>(fetcher);
		registry.set(key, resource as Resource<unknown>);
	}
	return resource;
}

/**
 * Get a cached resource and kick off a fetch if it's missing or stale. Call this
 * once in a component's script; read `.data` / `.error` reactively in markup.
 */
export function query<T>(
	key: string,
	fetcher: () => Promise<T>,
	options?: { staleMs?: number }
): Resource<T> {
	// SSR: skeleton only, and never populate the shared server-side registry.
	if (!browser) return new Resource<T>(fetcher);

	const resource = getResource(key, fetcher);
	const staleMs = options?.staleMs ?? DEFAULT_STALE_MS;
	if (resource.data === undefined || Date.now() - resource.fetchedAt > staleMs) {
		// Defer to a microtask: `query` is commonly called inside a `$derived`,
		// and `load()` mutates `$state` (loading/error). Mutating state during a
		// derived computation is forbidden (state_unsafe_mutation), so we let the
		// derived finish first, then kick off the fetch. `load()` de-dupes
		// in-flight requests, so multiple queued calls collapse into one.
		queueMicrotask(() => void resource.load());
	}
	return resource;
}

/**
 * Reactive, effect-driven query — the primitive to use when the cache key
 * depends on reactive state (e.g. a route param). Model borrowed from
 * TanStack Query / SWR: **reads are pure, fetching is a side effect.**
 *
 * The active resource is derived from `key()`, so it follows the key as it
 * changes. Revalidation runs inside an `$effect`, never during derivation — so
 * it can't trip Svelte's `state_unsafe_mutation` guard the way calling the
 * side-effecting `query()` inside a `$derived` does.
 *
 * MUST be called once, at the top level of a component's `<script>` (that's
 * where `$effect`/`$derived` are allowed to register). Read `.data` / `.error`
 * reactively in markup; call `.load()` to force a revalidation and `.set()` to
 * patch optimistically.
 */
export function createQuery<T>(
	key: () => string,
	fetcher: (key: string) => Promise<T>,
	options?: { staleMs?: number }
): {
	readonly data: T | undefined;
	readonly error: string | null;
	readonly loading: boolean;
	load: () => Promise<void>;
	set: (updater: (current: T | undefined) => T) => void;
} {
	const staleMs = options?.staleMs ?? DEFAULT_STALE_MS;

	// Follow the key. On the server we hand back a throwaway resource and never
	// touch the shared registry — module state is shared across requests there,
	// so caching per-user data would leak between users.
	const resource = $derived.by(() => {
		const k = key();
		return browser ? getResource<T>(k, () => fetcher(k)) : new Resource<T>(() => fetcher(k));
	});

	// Fetching lives here, in an effect — the one place side effects belong.
	// Re-runs when the key (hence resource) changes or the data goes stale;
	// `load()` de-dupes in-flight requests so this settles after one fetch.
	$effect(() => {
		const r = resource;
		if (r.data === undefined || Date.now() - r.fetchedAt > staleMs) {
			void r.load();
		}
	});

	return {
		get data() {
			return resource.data;
		},
		get error() {
			return resource.error;
		},
		get loading() {
			return resource.loading;
		},
		load: () => resource.load(),
		set: (updater) => resource.set(updater)
	};
}

/** Patch a cached resource by key without a refetch (instant optimistic update). */
export function mutate<T>(key: string, updater: (current: T | undefined) => T): void {
	const resource = registry.get(key) as Resource<T> | undefined;
	resource?.set(updater);
}

/** Force a background revalidation of a cached resource by key. */
export function invalidate(key: string): void {
	registry.get(key)?.load();
}
