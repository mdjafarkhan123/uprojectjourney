import { TRIGGERS, type DndEvent } from 'svelte-dnd-action';

// Shared drag-to-reorder controller. Pair it with the library's `dragHandleZone` +
// `dragHandle` actions (see below) and the `<ReorderConfirmModal>` component. A drop
// never persists silently: it opens a confirmation modal, Save writes the new order,
// Cancel restores the pre-drag order exactly.
//
// Why the whole thing lives here: getting reordering right has three easy-to-miss parts,
// and every list needs all three —
//   1. Grab-on-first-try: only works via `dragHandle`/`dragHandleZone` (a manual
//      `dragDisabled` toggle from an `onmousedown` handle misses the first grab, because
//      Svelte 5 delegates `onmousedown` to the app root, above the row the zone listens on).
//   2. A pre-drag snapshot, captured on DRAG_STARTED — the `consider` handler overwrites
//      the live list mid-drag, so Cancel needs the snapshot to revert to.
//   3. Commit only after every PATCH succeeds, so a failed save leaves the order revertible.
//
// Usage in a component:
//   const reorder = createReorderConfirm<Row>({
//     read: () => rows,
//     write: (items) => (rows = items),
//     endpoint: (id) => `/api/rows/${id}`,
//     onSaved: (items) => cache.set(() => items) // optional, sync a source-of-truth
//   });
//   <ul use:dragHandleZone={{ items: rows, flipDurationMs, type: 'rows' }}
//       onconsider={reorder.consider} onfinalize={reorder.finalize}>
//   <ReorderConfirmModal controller={reorder} noun="rows" />

export interface ReorderRow {
	id: string;
	position: number;
}

interface ReorderConfig<T extends ReorderRow> {
	/** The live list the dndzone renders. Read fresh on every call. */
	read: () => T[];
	/** Apply a list to the live view — called during drag, on revert, and on commit. */
	write: (items: T[]) => void;
	/** Build the PATCH URL for a single row (the body is `{ position }`). */
	endpoint: (id: string) => string;
	/** Optional: sync a cache / source-of-truth once a save succeeds. */
	onSaved?: (items: T[]) => void;
}

export interface ReorderController<T extends ReorderRow> {
	consider: (e: CustomEvent<DndEvent<T>>) => void;
	finalize: (e: CustomEvent<DndEvent<T>>) => void;
	confirm: () => Promise<void>;
	cancel: () => void;
	readonly open: boolean;
	readonly saving: boolean;
	readonly error: string;
}

export function createReorderConfirm<T extends ReorderRow>(
	config: ReorderConfig<T>
): ReorderController<T> {
	let open = $state(false);
	let saving = $state(false);
	let error = $state('');
	let snapshot: T[] = [];
	let pending: T[] = [];

	function consider(e: CustomEvent<DndEvent<T>>) {
		if (e.detail.info.trigger === TRIGGERS.DRAG_STARTED) {
			snapshot = config.read().map((row) => ({ ...row }));
		}
		config.write(e.detail.items);
	}

	function finalize(e: CustomEvent<DndEvent<T>>) {
		config.write(e.detail.items);
		const before = snapshot.map((row) => row.id).join(',');
		const after = e.detail.items.map((row) => row.id).join(',');
		if (before === after) return; // dropped back where it started — nothing to confirm
		pending = e.detail.items;
		error = '';
		open = true;
	}

	async function confirm() {
		if (saving) return;
		saving = true;
		error = '';
		try {
			const prev = new Map(snapshot.map((row) => [row.id, row.position]));
			const reordered = pending.map((row, i) => ({ ...row, position: i }));
			const changed = reordered.filter((row) => prev.get(row.id) !== row.position);
			const results = await Promise.all(
				changed.map((row) =>
					fetch(config.endpoint(row.id), {
						method: 'PATCH',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ position: row.position })
					})
				)
			);
			if (results.some((r) => !r.ok)) throw new Error('save failed');
			config.write(reordered);
			config.onSaved?.(reordered);
			open = false;
		} catch {
			error = 'Could not save the new order. Please try again.';
		} finally {
			saving = false;
		}
	}

	function cancel() {
		if (saving) return;
		config.write(snapshot.map((row) => ({ ...row })));
		open = false;
	}

	return {
		consider,
		finalize,
		confirm,
		cancel,
		get open() {
			return open;
		},
		get saving() {
			return saving;
		},
		get error() {
			return error;
		}
	};
}
