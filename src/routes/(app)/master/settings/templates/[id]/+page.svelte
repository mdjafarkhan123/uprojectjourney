<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Select } from 'bits-ui';
	import { flip } from 'svelte/animate';
	import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
	import Modal from '$lib/components/Modal.svelte';
	import ReorderConfirmModal from '$lib/components/ReorderConfirmModal.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { createQuery, mutate } from '$lib/data/cache.svelte';
	import { createReorderConfirm } from '$lib/data/reorder.svelte';

	type Status = 'not_started' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';

	type Item = {
		id: string;
		title: string;
		description: string | null;
		default_status: Status;
		position: number;
	};
	type Ms = {
		id: string;
		name: string;
		weight: number;
		overview: string | null;
		position: number;
		items: Item[];
	};
	type Template = {
		id: string;
		name: string;
		icon: string;
		description: string | null;
		milestones: Ms[];
	};

	// Admin-facing status labels (the client-facing portal phrases these differently).
	const statusMeta: Record<Status, { label: string; className: string }> = {
		not_started: { label: 'Not started', className: 'badge--gray' },
		in_progress: { label: 'In progress', className: 'badge--progress' },
		waiting_for_client: { label: 'Waiting for client', className: 'badge--waiting' },
		under_review: { label: 'Under review', className: 'badge--review' },
		completed: { label: 'Completed', className: 'badge--success' }
	};
	const statusItems = (Object.keys(statusMeta) as Status[]).map((v) => ({
		value: v,
		label: statusMeta[v].label
	}));

	const DEFAULT_ICON = 'ri-file-list-3-line';

	// Fetch the full template tree. Pure CSR; the key follows the route param so
	// navigating between templates refetches cleanly.
	const tplQ = createQuery<Template>(
		() => `template:${page.params.id}`,
		async (key) => {
			const id = key.slice('template:'.length);
			const res = await fetch(`/api/templates/${id}`);
			if (res.status === 404) throw new Error('This template no longer exists.');
			if (!res.ok) throw new Error('Could not load this template.');
			const body = await res.json();
			return body.template as Template;
		}
	);

	// Local working copy — the live model the editor mutates. Seeded once per template
	// id from the fetched tree; every edit persists to the server and updates it here.
	let loadedId = $state<string | null>(null);
	let name = $state('');
	let icon = $state('');
	let description = $state<string | null>(null);
	let milestones = $state<Ms[]>([]);
	let selectedId = $state<string | null>(null);

	$effect(() => {
		const t = tplQ.data;
		if (t && t.id !== loadedId) {
			loadedId = t.id;
			name = t.name;
			icon = t.icon;
			description = t.description;
			milestones = t.milestones.map((m) => ({ ...m, items: m.items.map((it) => ({ ...it })) }));
			selectedId = milestones[0]?.id ?? null;
		}
	});

	const selected = $derived(milestones.find((m) => m.id === selectedId) ?? null);

	// Keep the library grid's count chips accurate as the tree changes.
	function patchCounts(dMilestones: number, dItems: number) {
		mutate<{ id: string; milestoneCount: number; itemCount: number }[]>('templates', (cur) =>
			(cur ?? []).map((t) =>
				t.id === loadedId
					? {
							...t,
							milestoneCount: t.milestoneCount + dMilestones,
							itemCount: t.itemCount + dItems
						}
					: t
			)
		);
	}

	// ---------------------------------------------------------------------------
	// Template header edit
	// ---------------------------------------------------------------------------
	let tplEditOpen = $state(false);
	let tName = $state('');
	let tIcon = $state('');
	let tDesc = $state('');
	let tSaving = $state(false);
	let tError = $state('');
	let tFieldErrors = $state<{ name?: string; icon?: string; description?: string }>({});

	function openTplEdit() {
		tName = name;
		tIcon = icon;
		tDesc = description ?? '';
		tError = '';
		tFieldErrors = {};
		tplEditOpen = true;
	}
	function closeTplEdit() {
		if (tSaving) return;
		tplEditOpen = false;
	}
	async function submitTplEdit(event: SubmitEvent) {
		event.preventDefault();
		if (tSaving) return;
		tSaving = true;
		tError = '';
		tFieldErrors = {};
		try {
			const res = await fetch(`/api/templates/${loadedId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: tName,
					icon: tIcon.trim() || DEFAULT_ICON,
					description: tDesc.trim() || null
				})
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				const errs = payload.errors ?? {};
				tFieldErrors = {
					name: errs.name?.[0],
					icon: errs.icon?.[0],
					description: errs.description?.[0]
				};
				tError = payload.message ?? 'Something went wrong. Please try again.';
				tSaving = false;
				return;
			}
			const t = payload.template as Template;
			name = t.name;
			icon = t.icon;
			description = t.description;
			mutate<{ id: string; name: string; icon: string; description: string | null }[]>(
				'templates',
				(cur) =>
					(cur ?? []).map((row) =>
						row.id === loadedId
							? { ...row, name: t.name, icon: t.icon, description: t.description }
							: row
					)
			);
			tplEditOpen = false;
			tSaving = false;
		} catch {
			tError = 'Could not reach the server. Please try again.';
			tSaving = false;
		}
	}

	// ---------------------------------------------------------------------------
	// Milestone create / edit (shared modal)
	// ---------------------------------------------------------------------------
	let msModalOpen = $state(false);
	let msEditId = $state<string | null>(null); // null = create
	let msName = $state('');
	let msWeight = $state('1');
	let msOverview = $state('');
	let msSaving = $state(false);
	let msError = $state('');
	let msFieldErrors = $state<{ name?: string; weight?: string; overview?: string }>({});

	function openMsCreate() {
		msEditId = null;
		msName = '';
		msWeight = '1';
		msOverview = '';
		msError = '';
		msFieldErrors = {};
		msModalOpen = true;
	}
	function openMsEdit(m: Ms) {
		msEditId = m.id;
		msName = m.name;
		msWeight = String(m.weight);
		msOverview = m.overview ?? '';
		msError = '';
		msFieldErrors = {};
		msModalOpen = true;
	}
	function closeMsModal() {
		if (msSaving) return;
		msModalOpen = false;
	}
	async function submitMs(event: SubmitEvent) {
		event.preventDefault();
		if (msSaving) return;
		msSaving = true;
		msError = '';
		msFieldErrors = {};

		const weightNum = Number(msWeight);
		if (!Number.isFinite(weightNum) || weightNum < 0) {
			msFieldErrors = { weight: 'Enter a number of 0 or more.' };
			msSaving = false;
			return;
		}

		const editing = msEditId !== null;
		const url = editing ? `/api/template-milestones/${msEditId}` : '/api/template-milestones';
		const body = editing
			? { name: msName, weight: weightNum, overview: msOverview.trim() || null }
			: {
					templateId: loadedId,
					name: msName,
					weight: weightNum,
					overview: msOverview.trim() || null
				};
		try {
			const res = await fetch(url, {
				method: editing ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				const errs = payload.errors ?? {};
				msFieldErrors = {
					name: errs.name?.[0],
					weight: errs.weight?.[0],
					overview: errs.overview?.[0]
				};
				msError = payload.message ?? 'Something went wrong. Please try again.';
				msSaving = false;
				return;
			}
			const m = payload.milestone as Omit<Ms, 'items'> & { items?: Item[] };
			if (editing) {
				milestones = milestones.map((x) =>
					x.id === m.id ? { ...x, name: m.name, weight: m.weight, overview: m.overview } : x
				);
			} else {
				milestones = [...milestones, { ...m, items: m.items ?? [] }];
				selectedId = m.id;
				patchCounts(1, 0);
			}
			msModalOpen = false;
			msSaving = false;
		} catch {
			msError = 'Could not reach the server. Please try again.';
			msSaving = false;
		}
	}

	// Milestone delete
	let msDelete = $state<Ms | null>(null);
	let msDeleting = $state(false);
	let msDeleteError = $state('');
	const msDeleteOpen = $derived(msDelete !== null);
	function askMsDelete(m: Ms) {
		msDelete = m;
		msDeleteError = '';
	}
	function closeMsDelete() {
		if (msDeleting) return;
		msDelete = null;
	}
	async function confirmMsDelete() {
		if (msDeleting || !msDelete) return;
		msDeleting = true;
		msDeleteError = '';
		const target = msDelete;
		try {
			const res = await fetch(`/api/template-milestones/${target.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				msDeleteError = payload.message ?? 'Could not delete the milestone. Please try again.';
				msDeleting = false;
				return;
			}
			const removedItems = target.items.length;
			milestones = milestones.filter((m) => m.id !== target.id);
			if (selectedId === target.id) selectedId = milestones[0]?.id ?? null;
			patchCounts(-1, -removedItems);
			msDelete = null;
			msDeleting = false;
		} catch {
			msDeleteError = 'Could not reach the server. Please try again.';
			msDeleting = false;
		}
	}

	// ---------------------------------------------------------------------------
	// Item create / edit (shared modal)
	// ---------------------------------------------------------------------------
	let itModalOpen = $state(false);
	let itEditId = $state<string | null>(null); // null = create
	let itTitle = $state('');
	let itDesc = $state('');
	let itStatus = $state<Status>('not_started');
	let itSaving = $state(false);
	let itError = $state('');
	let itFieldErrors = $state<{ title?: string; description?: string }>({});

	function openItCreate() {
		itEditId = null;
		itTitle = '';
		itDesc = '';
		itStatus = 'not_started';
		itError = '';
		itFieldErrors = {};
		itModalOpen = true;
	}
	function openItEdit(it: Item) {
		itEditId = it.id;
		itTitle = it.title;
		itDesc = it.description ?? '';
		itStatus = it.default_status;
		itError = '';
		itFieldErrors = {};
		itModalOpen = true;
	}
	function closeItModal() {
		if (itSaving) return;
		itModalOpen = false;
	}
	async function submitIt(event: SubmitEvent) {
		event.preventDefault();
		if (itSaving || !selected) return;
		itSaving = true;
		itError = '';
		itFieldErrors = {};

		const editing = itEditId !== null;
		const url = editing ? `/api/template-items/${itEditId}` : '/api/template-items';
		const body = editing
			? { title: itTitle, description: itDesc.trim() || null, defaultStatus: itStatus }
			: {
					templateMilestoneId: selected.id,
					title: itTitle,
					description: itDesc.trim() || null,
					defaultStatus: itStatus
				};
		try {
			const res = await fetch(url, {
				method: editing ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				const errs = payload.errors ?? {};
				itFieldErrors = { title: errs.title?.[0], description: errs.description?.[0] };
				itError = payload.message ?? 'Something went wrong. Please try again.';
				itSaving = false;
				return;
			}
			const it = payload.item as Item;
			const msId = selected.id;
			milestones = milestones.map((m) => {
				if (m.id !== msId) return m;
				const items = editing ? m.items.map((x) => (x.id === it.id ? it : x)) : [...m.items, it];
				return { ...m, items };
			});
			if (!editing) patchCounts(0, 1);
			itModalOpen = false;
			itSaving = false;
		} catch {
			itError = 'Could not reach the server. Please try again.';
			itSaving = false;
		}
	}

	// Item delete
	let itDelete = $state<Item | null>(null);
	let itDeleting = $state(false);
	let itDeleteError = $state('');
	const itDeleteOpen = $derived(itDelete !== null);
	function askItDelete(it: Item) {
		itDelete = it;
		itDeleteError = '';
	}
	function closeItDelete() {
		if (itDeleting) return;
		itDelete = null;
	}
	async function confirmItDelete() {
		if (itDeleting || !itDelete || !selected) return;
		itDeleting = true;
		itDeleteError = '';
		const target = itDelete;
		const msId = selected.id;
		try {
			const res = await fetch(`/api/template-items/${target.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				itDeleteError = payload.message ?? 'Could not delete the item. Please try again.';
				itDeleting = false;
				return;
			}
			milestones = milestones.map((m) =>
				m.id === msId ? { ...m, items: m.items.filter((x) => x.id !== target.id) } : m
			);
			patchCounts(0, -1);
			itDelete = null;
			itDeleting = false;
		} catch {
			itDeleteError = 'Could not reach the server. Please try again.';
			itDeleting = false;
		}
	}

	// ---------------------------------------------------------------------------
	// Drag-to-reorder (handle-based) — milestones and items
	// ---------------------------------------------------------------------------
	// One shared controller per list (see `$lib/data/reorder.svelte`): it owns the
	// grab-on-first-try wiring, the pre-drag snapshot, the save-confirmation modal, and
	// the "commit only after every PATCH succeeds" persistence.
	const flipDurationMs = 160;

	const msReorder = createReorderConfirm<Ms>({
		read: () => milestones,
		write: (items) => (milestones = items),
		endpoint: (id) => `/api/template-milestones/${id}`
	});
	const itReorder = createReorderConfirm<Item>({
		read: () => selected?.items ?? [],
		write: (items) => {
			const msId = selected?.id;
			if (!msId) return;
			milestones = milestones.map((m) => (m.id === msId ? { ...m, items } : m));
		},
		endpoint: (id) => `/api/template-items/${id}`
	});

	const selectedStatusLabel = $derived(statusMeta[itStatus].label);

	// Back link returns to the Templates tab of Settings.
	const backHref = resolve('/master/settings?tab=templates');
</script>

<svelte:head>
	<title>{name || 'Template'} · Templates</title>
</svelte:head>

<section class="page">
	<a class="back" href={backHref}>
		<i class="ri-arrow-left-line" aria-hidden="true"></i>
		<span>Back to templates</span>
	</a>

	{#if tplQ.error}
		<div class="notice">
			<i class="ri-error-warning-line notice__icon" aria-hidden="true"></i>
			<p class="notice__text">{tplQ.error}</p>
			<a class="btn btn--secondary" href={backHref}> Back to templates </a>
		</div>
	{:else if tplQ.data === undefined}
		<div class="head">
			<Skeleton width="48px" height="48px" radius="var(--radius-base)" />
			<Skeleton width="220px" height="24px" />
		</div>
		<div class="editor">
			<div class="panel">
				<Skeleton width="100%" height="52px" radius="var(--radius-base)" />
				<Skeleton width="100%" height="52px" radius="var(--radius-base)" />
				<Skeleton width="100%" height="52px" radius="var(--radius-base)" />
			</div>
			<div class="panel">
				<Skeleton width="100%" height="52px" radius="var(--radius-base)" />
				<Skeleton width="100%" height="52px" radius="var(--radius-base)" />
			</div>
		</div>
	{:else}
		<header class="head">
			<span class="head__icon"><i class={icon || DEFAULT_ICON} aria-hidden="true"></i></span>
			<div class="head__titles">
				<h1 class="head__name">{name}</h1>
				{#if description}
					<p class="head__desc">{description}</p>
				{/if}
			</div>
			<button class="btn btn--secondary" type="button" onclick={openTplEdit}>
				<i class="ri-pencil-line" aria-hidden="true"></i>
				<span>Edit</span>
			</button>
		</header>

		<div class="editor">
			<!-- Milestones -->
			<div class="panel">
				<div class="panel__head">
					<h2 class="panel__title">Milestones</h2>
					<button class="btn btn--sm btn--brand" type="button" onclick={openMsCreate}>
						<i class="ri-add-line" aria-hidden="true"></i>
						<span>Add</span>
					</button>
				</div>

				{#if milestones.length === 0}
					<p class="panel__empty">No milestones yet. Add the first phase of this workflow.</p>
				{:else}
					<ul
						class="rows"
						use:dragHandleZone={{
							items: milestones,
							flipDurationMs,
							type: 'ms'
						}}
						onconsider={msReorder.consider}
						onfinalize={msReorder.finalize}
					>
						{#each milestones as m (m.id)}
							<li
								class="row"
								class:row--active={m.id === selectedId}
								animate:flip={{ duration: flipDurationMs }}
							>
								<button
									class="row__handle"
									type="button"
									aria-label="Drag to reorder {m.name}"
									use:dragHandle
								>
									<i class="ri-draggable" aria-hidden="true"></i>
								</button>
								<button class="row__main" type="button" onclick={() => (selectedId = m.id)}>
									<span class="row__title">{m.name}</span>
									<span class="row__meta">
										<span class="mini">×{m.weight}</span>
										<span class="mini"
											>{m.items.length} {m.items.length === 1 ? 'item' : 'items'}</span
										>
									</span>
								</button>
								<div class="row__actions">
									<button
										class="icon-btn"
										type="button"
										aria-label="Edit {m.name}"
										title="Edit"
										onclick={() => openMsEdit(m)}
									>
										<i class="ri-pencil-line" aria-hidden="true"></i>
									</button>
									<button
										class="icon-btn icon-btn--danger"
										type="button"
										aria-label="Delete {m.name}"
										title="Delete"
										onclick={() => askMsDelete(m)}
									>
										<i class="ri-delete-bin-line" aria-hidden="true"></i>
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<!-- Items of the selected milestone -->
			<div class="panel">
				<div class="panel__head">
					<h2 class="panel__title">
						{selected ? `Work items — ${selected.name}` : 'Work items'}
					</h2>
					{#if selected}
						<button class="btn btn--sm btn--brand" type="button" onclick={openItCreate}>
							<i class="ri-add-line" aria-hidden="true"></i>
							<span>Add</span>
						</button>
					{/if}
				</div>

				{#if !selected}
					<p class="panel__empty">Select a milestone to see its work items.</p>
				{:else if selected.items.length === 0}
					<p class="panel__empty">No work items yet. Add the first task for this milestone.</p>
				{:else}
					<ul
						class="rows"
						use:dragHandleZone={{
							items: selected.items,
							flipDurationMs,
							type: 'it'
						}}
						onconsider={itReorder.consider}
						onfinalize={itReorder.finalize}
					>
						{#each selected.items as it (it.id)}
							<li class="row" animate:flip={{ duration: flipDurationMs }}>
								<button
									class="row__handle"
									type="button"
									aria-label="Drag to reorder {it.title}"
									use:dragHandle
								>
									<i class="ri-draggable" aria-hidden="true"></i>
								</button>
								<div class="row__main row__main--static">
									<span class="row__title">{it.title}</span>
									{#if it.description}
										<span class="row__sub">{it.description}</span>
									{/if}
									<span class="badge {statusMeta[it.default_status].className} row__badge">
										{statusMeta[it.default_status].label}
									</span>
								</div>
								<div class="row__actions">
									<button
										class="icon-btn"
										type="button"
										aria-label="Edit {it.title}"
										title="Edit"
										onclick={() => openItEdit(it)}
									>
										<i class="ri-pencil-line" aria-hidden="true"></i>
									</button>
									<button
										class="icon-btn icon-btn--danger"
										type="button"
										aria-label="Delete {it.title}"
										title="Delete"
										onclick={() => askItDelete(it)}
									>
										<i class="ri-delete-bin-line" aria-hidden="true"></i>
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</section>

<!-- Edit template -->
<Modal open={tplEditOpen} title="Edit template" onclose={closeTplEdit}>
	<form id="edit-tpl-form" class="form" onsubmit={submitTplEdit} novalidate>
		{#if tError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{tError}</span>
			</div>
		{/if}
		<div class="form__field">
			<label class="form__label" for="tpl-name">Name</label>
			<input
				id="tpl-name"
				class="form__input"
				class:form__input--error={tFieldErrors.name}
				type="text"
				bind:value={tName}
				disabled={tSaving}
				required
			/>
			{#if tFieldErrors.name}<p class="form__error">{tFieldErrors.name}</p>{/if}
		</div>
		<div class="form__field">
			<label class="form__label" for="tpl-icon">Icon</label>
			<div class="icon-field">
				<span class="icon-field__preview"
					><i class={tIcon.trim() || DEFAULT_ICON} aria-hidden="true"></i></span
				>
				<input
					id="tpl-icon"
					class="form__input"
					class:form__input--error={tFieldErrors.icon}
					type="text"
					autocapitalize="none"
					spellcheck="false"
					bind:value={tIcon}
					disabled={tSaving}
					placeholder="ri-file-list-3-line"
				/>
			</div>
			{#if tFieldErrors.icon}
				<p class="form__error">{tFieldErrors.icon}</p>
			{:else}
				<p class="form__hint">A RemixIcon class name (browse at remixicon.com).</p>
			{/if}
		</div>
		<div class="form__field">
			<label class="form__label" for="tpl-desc">Description</label>
			<textarea
				id="tpl-desc"
				class="form__input form__textarea"
				bind:value={tDesc}
				disabled={tSaving}
				rows="2"
				placeholder="Optional — what this workflow is for."></textarea>
			{#if tFieldErrors.description}<p class="form__error">{tFieldErrors.description}</p>{/if}
		</div>
	</form>
	{#snippet footer()}
		<button class="btn btn--secondary" type="button" onclick={closeTplEdit} disabled={tSaving}>
			Cancel
		</button>
		<button class="btn btn--brand" type="submit" form="edit-tpl-form" disabled={tSaving}>
			{#if tSaving}
				<span class="btn__spinner" aria-hidden="true"></span><span>Saving…</span>
			{:else}
				<i class="ri-check-line" aria-hidden="true"></i><span>Save</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Create / edit milestone -->
<Modal
	open={msModalOpen}
	title={msEditId ? 'Edit milestone' : 'Add milestone'}
	onclose={closeMsModal}
>
	<form id="ms-form" class="form" onsubmit={submitMs} novalidate>
		{#if msError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{msError}</span>
			</div>
		{/if}
		<div class="form__field">
			<label class="form__label" for="ms-name">Name</label>
			<input
				id="ms-name"
				class="form__input"
				class:form__input--error={msFieldErrors.name}
				type="text"
				bind:value={msName}
				disabled={msSaving}
				required
			/>
			{#if msFieldErrors.name}<p class="form__error">{msFieldErrors.name}</p>{/if}
		</div>
		<div class="form__field">
			<label class="form__label" for="ms-weight">Weight</label>
			<input
				id="ms-weight"
				class="form__input"
				class:form__input--error={msFieldErrors.weight}
				type="number"
				min="0"
				step="1"
				bind:value={msWeight}
				disabled={msSaving}
			/>
			{#if msFieldErrors.weight}
				<p class="form__error">{msFieldErrors.weight}</p>
			{:else}
				<p class="form__hint">How much this milestone counts toward overall progress. Default 1.</p>
			{/if}
		</div>
		<div class="form__field">
			<label class="form__label" for="ms-overview">Overview</label>
			<textarea
				id="ms-overview"
				class="form__input form__textarea"
				bind:value={msOverview}
				disabled={msSaving}
				rows="2"
				placeholder="Optional — a short description of this phase."></textarea>
			{#if msFieldErrors.overview}<p class="form__error">{msFieldErrors.overview}</p>{/if}
		</div>
	</form>
	{#snippet footer()}
		<button class="btn btn--secondary" type="button" onclick={closeMsModal} disabled={msSaving}>
			Cancel
		</button>
		<button class="btn btn--brand" type="submit" form="ms-form" disabled={msSaving}>
			{#if msSaving}
				<span class="btn__spinner" aria-hidden="true"></span><span>Saving…</span>
			{:else}
				<i class="ri-check-line" aria-hidden="true"></i><span
					>{msEditId ? 'Save' : 'Add milestone'}</span
				>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Delete milestone -->
<Modal open={msDeleteOpen} title="Delete milestone" onclose={closeMsDelete}>
	<div class="confirm">
		<i class="ri-error-warning-line confirm__icon" aria-hidden="true"></i>
		<p class="confirm__text">
			Delete <strong>{msDelete?.name}</strong> and its
			{msDelete?.items.length}
			{msDelete?.items.length === 1 ? 'item' : 'items'}? This can't be undone.
		</p>
		{#if msDeleteError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{msDeleteError}</span>
			</div>
		{/if}
	</div>
	{#snippet footer()}
		<button class="btn btn--secondary" type="button" onclick={closeMsDelete} disabled={msDeleting}>
			Cancel
		</button>
		<button class="btn btn--danger" type="button" onclick={confirmMsDelete} disabled={msDeleting}>
			{#if msDeleting}
				<span class="btn__spinner" aria-hidden="true"></span><span>Deleting…</span>
			{:else}
				<i class="ri-delete-bin-line" aria-hidden="true"></i><span>Delete</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Create / edit item -->
<Modal
	open={itModalOpen}
	title={itEditId ? 'Edit work item' : 'Add work item'}
	onclose={closeItModal}
>
	<form id="it-form" class="form" onsubmit={submitIt} novalidate>
		{#if itError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{itError}</span>
			</div>
		{/if}
		<div class="form__field">
			<label class="form__label" for="it-title">Title</label>
			<input
				id="it-title"
				class="form__input"
				class:form__input--error={itFieldErrors.title}
				type="text"
				bind:value={itTitle}
				disabled={itSaving}
				required
			/>
			{#if itFieldErrors.title}<p class="form__error">{itFieldErrors.title}</p>{/if}
		</div>
		<div class="form__field">
			<label class="form__label" for="it-desc">Description</label>
			<textarea
				id="it-desc"
				class="form__input form__textarea"
				bind:value={itDesc}
				disabled={itSaving}
				rows="3"
				placeholder="Optional — details for this task."></textarea>
			{#if itFieldErrors.description}<p class="form__error">{itFieldErrors.description}</p>{/if}
		</div>
		<div class="form__field">
			<span class="form__label" id="it-status-label">Default status</span>
			<Select.Root
				type="single"
				value={itStatus}
				onValueChange={(v) => (itStatus = v as Status)}
				items={statusItems}
				disabled={itSaving}
			>
				<Select.Trigger class="select__trigger" aria-labelledby="it-status-label">
					<span>{selectedStatusLabel}</span>
					<i class="ri-arrow-down-s-line" aria-hidden="true"></i>
				</Select.Trigger>
				<Select.Portal>
					<Select.Content class="select__content">
						<Select.Viewport>
							{#each statusItems as item (item.value)}
								<Select.Item class="select__item" value={item.value} label={item.label}>
									{#snippet children({ selected: sel })}
										<span>{item.label}</span>
										{#if sel}<i class="ri-check-line" aria-hidden="true"></i>{/if}
									{/snippet}
								</Select.Item>
							{/each}
						</Select.Viewport>
					</Select.Content>
				</Select.Portal>
			</Select.Root>
			<p class="form__hint">The status a fresh project's timeline entry starts at.</p>
		</div>
	</form>
	{#snippet footer()}
		<button class="btn btn--secondary" type="button" onclick={closeItModal} disabled={itSaving}>
			Cancel
		</button>
		<button class="btn btn--brand" type="submit" form="it-form" disabled={itSaving}>
			{#if itSaving}
				<span class="btn__spinner" aria-hidden="true"></span><span>Saving…</span>
			{:else}
				<i class="ri-check-line" aria-hidden="true"></i><span>{itEditId ? 'Save' : 'Add item'}</span
				>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Delete item -->
<Modal open={itDeleteOpen} title="Delete work item" onclose={closeItDelete}>
	<div class="confirm">
		<i class="ri-error-warning-line confirm__icon" aria-hidden="true"></i>
		<p class="confirm__text">Delete <strong>{itDelete?.title}</strong>? This can't be undone.</p>
		{#if itDeleteError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{itDeleteError}</span>
			</div>
		{/if}
	</div>
	{#snippet footer()}
		<button class="btn btn--secondary" type="button" onclick={closeItDelete} disabled={itDeleting}>
			Cancel
		</button>
		<button class="btn btn--danger" type="button" onclick={confirmItDelete} disabled={itDeleting}>
			{#if itDeleting}
				<span class="btn__spinner" aria-hidden="true"></span><span>Deleting…</span>
			{:else}
				<i class="ri-delete-bin-line" aria-hidden="true"></i><span>Delete</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Confirm reordering -->
<ReorderConfirmModal controller={msReorder} noun="these milestones" />
<ReorderConfirmModal controller={itReorder} noun="these work items" />

<style lang="scss">
	// .page {
	// 	max-width: 1040px;
	// }

	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 20px;
		font-size: 14px;
		color: var(--text-body);
		text-decoration: none;

		i {
			font-size: 18px;
		}

		&:hover {
			color: var(--fg-brand);
		}
	}

	.notice {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 56px 24px;
		text-align: center;
		background-color: var(--neutral-primary-soft);
		border: 1px dashed var(--border-default-strong);
		border-radius: var(--radius-base);

		&__icon {
			font-size: 32px;
			color: var(--fg-danger);
		}

		&__text {
			margin: 0;
			font-size: 14px;
			color: var(--text-body);
		}
	}

	.head {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 28px;

		&__icon {
			display: inline-flex;
			flex-shrink: 0;
			align-items: center;
			justify-content: center;
			width: 48px;
			height: 48px;
			font-size: 26px;
			color: var(--fg-brand);
			background-color: var(--neutral-secondary-medium);
			border-radius: var(--radius-base);
		}

		&__titles {
			flex: 1;
			min-width: 0;
		}

		&__name {
			margin: 0;
			font-size: 22px;
			font-weight: 600;
			line-height: 1.25;
			color: var(--text-heading);
		}

		&__desc {
			margin: 4px 0 0;
			font-size: 13px;
			color: var(--text-body);
		}
	}

	.editor {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
		gap: 20px;
		align-items: start;

		@media (max-width: 860px) {
			grid-template-columns: 1fr;
		}
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 18px;
		background-color: var(--neutral-primary-soft);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);

		&__head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
		}

		&__title {
			margin: 0;
			font-size: 15px;
			font-weight: 600;
			color: var(--text-heading);
		}

		&__empty {
			margin: 4px 0;
			padding: 20px;
			font-size: 13px;
			text-align: center;
			color: var(--text-body-subtle);
			background-color: var(--neutral-secondary-soft);
			border: 1px dashed var(--border-default);
			border-radius: var(--radius-base);
		}
	}

	.rows {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background-color: var(--neutral-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);

		&--active {
			border-color: var(--border-brand);
			box-shadow: 0 0 0 1px var(--brand);
		}

		&__handle {
			display: inline-flex;
			flex-shrink: 0;
			align-items: center;
			justify-content: center;
			padding: 4px;
			color: var(--text-body-subtle);
			background-color: transparent;
			border: none;
			border-radius: var(--radius-base);
			cursor: grab;

			i {
				font-size: 18px;
			}

			&:hover {
				color: var(--text-body);
				background-color: var(--neutral-secondary-medium);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 3px var(--brand-medium);
			}
		}

		&__main {
			display: flex;
			flex: 1;
			min-width: 0;
			flex-direction: column;
			gap: 4px;
			padding: 2px 0;
			text-align: left;
			background-color: transparent;
			border: none;
			cursor: pointer;

			&--static {
				cursor: default;
			}
		}

		&__title {
			font-size: 14px;
			font-weight: 500;
			color: var(--text-heading);
			overflow: hidden;
			text-overflow: ellipsis;
		}

		&__sub {
			font-size: 12px;
			line-height: 1.45;
			color: var(--text-body-subtle);
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}

		&__badge {
			align-self: flex-start;
			margin-top: 2px;
		}

		&__meta {
			display: flex;
			gap: 8px;
		}

		&__actions {
			display: flex;
			flex-shrink: 0;
			gap: 2px;
		}
	}

	.mini {
		font-size: 12px;
		color: var(--text-body-subtle);
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		padding: 0;
		color: var(--text-body);
		background-color: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-base);
		cursor: pointer;
		transition: all 200ms;

		i {
			font-size: 16px;
		}

		&:hover:not(:disabled) {
			background-color: var(--neutral-secondary-medium);
		}

		&:focus-visible {
			outline: none;
			box-shadow: 0 0 0 3px var(--brand-medium);
		}

		&--danger:hover:not(:disabled) {
			color: var(--fg-danger);
			background-color: var(--danger-soft);
		}
	}

	.icon-field {
		display: flex;
		align-items: center;
		gap: 12px;

		&__preview {
			display: inline-flex;
			flex-shrink: 0;
			align-items: center;
			justify-content: center;
			width: 44px;
			height: 40px;
			font-size: 20px;
			color: var(--fg-brand);
			background-color: var(--neutral-secondary-medium);
			border: 1px solid var(--border-default-medium);
			border-radius: var(--radius-base);
		}

		.form__input {
			flex: 1;
		}
	}

	.confirm {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		text-align: center;

		&__icon {
			font-size: 48px;
			color: var(--fg-danger);
		}

		&__text {
			margin: 0;
			font-size: 14px;
			line-height: 1.6;
			color: var(--text-body);
		}
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;

		&__field {
			display: flex;
			flex-direction: column;
		}

		&__label {
			display: block;
			margin-bottom: 8px;
			font-size: 14px;
			font-weight: 500;
			color: var(--text-heading);
		}

		&__input {
			display: block;
			width: 100%;
			padding: 10px 12px;
			font-family: inherit;
			font-size: 14px;
			color: var(--text-heading);
			background-color: var(--neutral-secondary-medium);
			border: 1px solid var(--border-default-medium);
			border-radius: var(--radius-base);
			box-shadow: var(--shadow-xs);
			transition: all 200ms;

			&::placeholder {
				color: var(--text-body);
			}

			&:hover:not(:disabled) {
				border-color: var(--border-default-strong);
			}

			&:focus {
				outline: none;
				border-color: var(--border-brand);
				box-shadow: 0 0 0 1px var(--brand);
			}

			&:disabled {
				background-color: var(--disabled);
				color: var(--fg-disabled);
				cursor: not-allowed;
			}

			&--error {
				border-color: var(--border-danger);

				&:focus {
					border-color: var(--border-danger);
					box-shadow: 0 0 0 1px var(--danger);
				}
			}
		}

		&__textarea {
			resize: vertical;
			min-height: 60px;
			line-height: 1.5;
		}

		&__hint {
			margin: 6px 0 0;
			font-size: 12px;
			color: var(--text-body-subtle);
		}

		&__error {
			margin: 6px 0 0;
			font-size: 12px;
			color: var(--fg-danger);
		}

		&__alert {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 12px;
			font-size: 14px;
			color: var(--fg-danger);
			background-color: var(--danger-soft);
			border: 1px solid var(--border-danger);
			border-radius: var(--radius-base);

			i {
				font-size: 16px;
			}
		}
	}

	// bits-ui Select — Trigger in-flow, Content portalled (styled globally).
	:global(.select__trigger) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		padding: 10px 12px;
		font-family: inherit;
		font-size: 14px;
		text-align: left;
		color: var(--text-heading);
		background-color: var(--neutral-secondary-medium);
		border: 1px solid var(--border-default-medium);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);
		cursor: pointer;
		transition: all 200ms;

		i {
			font-size: 18px;
			color: var(--text-body);
		}

		&:hover:not([data-disabled]) {
			border-color: var(--border-default-strong);
		}

		&:focus-visible {
			outline: none;
			border-color: var(--border-brand);
			box-shadow: 0 0 0 1px var(--brand);
		}
	}

	:global(.select__trigger[data-disabled]) {
		background-color: var(--disabled);
		color: var(--fg-disabled);
		cursor: not-allowed;
	}

	:global(.select__content) {
		z-index: 50;
		width: var(--bits-select-anchor-width);
		max-height: var(--bits-select-content-available-height);
		padding: 6px;
		background-color: var(--neutral-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-lg);
	}

	:global(.select__item) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 10px;
		font-size: 14px;
		color: var(--text-heading);
		border-radius: var(--radius-base);
		cursor: pointer;
		user-select: none;

		i {
			font-size: 16px;
			color: var(--fg-brand);
		}
	}

	:global(.select__item[data-highlighted]) {
		background-color: var(--neutral-secondary-medium);
	}

	:global(.select__item[data-selected]) {
		color: var(--fg-brand-strong);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 16px;
		font-family: inherit;
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
		border: 1px solid transparent;
		border-radius: var(--radius-base);
		cursor: pointer;
		transition: background-color 200ms;

		i {
			font-size: 16px;
		}

		&:disabled {
			cursor: not-allowed;
			opacity: 0.85;
		}

		&--sm {
			padding: 7px 12px;
			font-size: 13px;
		}

		&--brand {
			color: var(--text-white);
			background-color: var(--brand);
			box-shadow:
				var(--shadow-xs),
				inset var(--color-1-400) 0 6px 0px -5px,
				var(--color-1-700) 0 4px 10px -5px;

			&:hover:not(:disabled) {
				background-color: var(--brand-strong);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 4px var(--brand-medium);
			}
		}

		&--secondary {
			color: var(--text-body);
			background-color: var(--neutral-secondary-medium);
			border-color: var(--border-default-medium);
			box-shadow:
				var(--shadow-xs),
				inset var(--color-1-400) 0 6px 0px -5px,
				var(--color-1-700) 0 4px 10px -5px;

			&:hover:not(:disabled) {
				color: var(--text-heading);
				background-color: var(--neutral-tertiary-medium);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 4px var(--neutral-tertiary);
			}
		}

		&--danger {
			color: var(--text-white);
			background-color: var(--danger);
			box-shadow:
				var(--shadow-xs),
				inset var(--color-1-400) 0 6px 0px -5px,
				var(--color-1-700) 0 4px 10px -5px;

			&:hover:not(:disabled) {
				background-color: var(--danger-strong);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 4px var(--danger-medium);
			}
		}

		&__spinner {
			width: 16px;
			height: 16px;
			border: 2px solid var(--color-1-400);
			border-top-color: currentColor;
			border-radius: var(--radius-full);
			animation: cj-spin 700ms linear infinite;
		}
	}
</style>
