<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { flip } from 'svelte/animate';
	import { dragHandleZone, dragHandle } from 'svelte-dnd-action';
	import Modal from '$lib/components/Modal.svelte';
	import ReorderConfirmModal from '$lib/components/ReorderConfirmModal.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { query } from '$lib/data/cache.svelte';
	import { createReorderConfirm } from '$lib/data/reorder.svelte';

	// The admin's workflow library. Shares the `templates` cache key with the
	// create-project picker (Projects page) — both fetchers return the full row
	// shape at runtime, so a mutation here keeps that picker fresh too.
	type Template = {
		id: string;
		name: string;
		icon: string;
		description: string | null;
		position: number;
		created_at: string;
		updated_at: string;
		milestoneCount: number;
		itemCount: number;
	};

	const templatesQ = query<Template[]>('templates', async () => {
		const res = await fetch('/api/templates');
		if (!res.ok) throw new Error('Could not load your templates.');
		const body = await res.json();
		return body.templates as Template[];
	});

	// Local drag copy of the grid. svelte-dnd-action needs a mutable array it owns;
	// we mirror the cache into it and, after a drop, write the new order back.
	let cards = $state<Template[]>([]);
	$effect(() => {
		if (templatesQ.data) cards = [...templatesQ.data];
	});

	const DEFAULT_ICON = 'ri-file-list-3-line';

	// --- Create modal ---
	let createOpen = $state(false);
	let cName = $state('');
	let cIcon = $state('');
	let creating = $state(false);
	let createError = $state('');
	let cFieldErrors = $state<{ name?: string; icon?: string }>({});

	function openCreate() {
		cName = '';
		cIcon = '';
		createError = '';
		cFieldErrors = {};
		createOpen = true;
	}
	function closeCreate() {
		if (creating) return;
		createOpen = false;
	}

	async function submitCreate(event: SubmitEvent) {
		event.preventDefault();
		if (creating) return;
		creating = true;
		createError = '';
		cFieldErrors = {};

		try {
			const res = await fetch('/api/templates', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: cName, ...(cIcon.trim() ? { icon: cIcon.trim() } : {}) })
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				const errs = payload.errors ?? {};
				cFieldErrors = { name: errs.name?.[0], icon: errs.icon?.[0] };
				createError = payload.message ?? 'Something went wrong. Please try again.';
				creating = false;
				return;
			}
			templatesQ.set((cur) => [...(cur ?? []), payload.template as Template]);
			createOpen = false;
			creating = false;
			// Jump straight into the new template so the admin can start editing.
			goto(resolve(`/master/settings/templates/${(payload.template as Template).id}`));
		} catch {
			createError = 'Could not reach the server. Please try again.';
			creating = false;
		}
	}

	// --- Duplicate ---
	let duplicatingId = $state<string | null>(null);
	async function duplicate(t: Template) {
		if (duplicatingId) return;
		duplicatingId = t.id;
		try {
			const res = await fetch(`/api/templates/${t.id}/duplicate`, { method: 'POST' });
			const payload = await res.json().catch(() => ({}));
			if (res.ok) {
				templatesQ.set((cur) => [...(cur ?? []), payload.template as Template]);
			}
		} finally {
			duplicatingId = null;
		}
	}

	// --- Delete confirm ---
	let deleteTarget = $state<Template | null>(null);
	let deleting = $state(false);
	let deleteError = $state('');
	const deleteOpen = $derived(deleteTarget !== null);

	function askDelete(t: Template) {
		deleteTarget = t;
		deleteError = '';
	}
	function closeDelete() {
		if (deleting) return;
		deleteTarget = null;
	}
	async function confirmDelete() {
		if (deleting || !deleteTarget) return;
		deleting = true;
		deleteError = '';
		const target = deleteTarget;
		try {
			const res = await fetch(`/api/templates/${target.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				deleteError = payload.message ?? 'Could not delete the template. Please try again.';
				deleting = false;
				return;
			}
			templatesQ.set((cur) => (cur ?? []).filter((t) => t.id !== target.id));
			deleteTarget = null;
			deleting = false;
		} catch {
			deleteError = 'Could not reach the server. Please try again.';
			deleting = false;
		}
	}

	// --- Drag-to-reorder (handle-based so card clicks/links still work) ---
	// Uses the library's `dragHandleZone`/`dragHandle` actions. They attach a direct
	// (non-delegated) mousedown listener on the handle, so the grab registers on the
	// first try — a plain `dragDisabled` toggle misses the first grab because Svelte 5
	// delegates `onmousedown` to the app root, above the row the zone listens on.
	const flipDurationMs = 160;

	// Drag-to-reorder with a save-confirmation modal. On commit we also push the new
	// order back into the shared `templates` cache so the create-project picker stays fresh.
	const reorder = createReorderConfirm<Template>({
		read: () => cards,
		write: (items) => (cards = items),
		endpoint: (id) => `/api/templates/${id}`,
		onSaved: (items) => templatesQ.set(() => items)
	});

	const skeletonCards = [0, 1, 2, 3];

	function openEditor(id: string) {
		goto(resolve(`/master/settings/templates/${id}`));
	}
</script>

<div class="lib">
	<div class="lib__head">
		<div>
			<h2 class="lib__title">Templates</h2>
			<p class="lib__desc">
				Reusable workflows. When you create a project, its milestones and work items are copied from
				the template you pick — editing a template never changes existing projects.
			</p>
		</div>
		<button class="btn btn--brand" type="button" onclick={openCreate}>
			<i class="ri-add-line" aria-hidden="true"></i>
			<span>New template</span>
		</button>
	</div>

	{#if templatesQ.error}
		<div class="lib__empty">
			<i class="ri-error-warning-line lib__empty-icon" aria-hidden="true"></i>
			<p class="lib__empty-text">{templatesQ.error}</p>
			<button class="btn btn--secondary" type="button" onclick={() => templatesQ.load()}>
				Try again
			</button>
		</div>
	{:else if templatesQ.data === undefined}
		<div class="grid">
			{#each skeletonCards as c (c)}
				<div class="card card--skel">
					<Skeleton width="40px" height="40px" radius="var(--radius-base)" />
					<Skeleton width="140px" height="16px" />
					<Skeleton width="180px" height="12px" />
				</div>
			{/each}
		</div>
	{:else if cards.length === 0}
		<div class="lib__empty">
			<i class="ri-stack-line lib__empty-icon" aria-hidden="true"></i>
			<p class="lib__empty-text">No templates yet. Create your first reusable workflow.</p>
			<button class="btn btn--brand" type="button" onclick={openCreate}>
				<i class="ri-add-line" aria-hidden="true"></i>
				<span>New template</span>
			</button>
		</div>
	{:else}
		<div
			class="grid"
			use:dragHandleZone={{ items: cards, flipDurationMs, type: 'templates' }}
			onconsider={reorder.consider}
			onfinalize={reorder.finalize}
		>
			{#each cards as t (t.id)}
				<div class="card" animate:flip={{ duration: flipDurationMs }}>
					<div class="card__top">
						<button
							class="card__handle"
							type="button"
							aria-label="Drag to reorder {t.name}"
							use:dragHandle
						>
							<i class="ri-draggable" aria-hidden="true"></i>
						</button>
						<span class="card__icon"><i class={t.icon || DEFAULT_ICON} aria-hidden="true"></i></span
						>
						<div class="card__menu">
							<button
								class="icon-btn"
								type="button"
								aria-label="Duplicate {t.name}"
								title="Duplicate"
								disabled={duplicatingId === t.id}
								onclick={() => duplicate(t)}
							>
								{#if duplicatingId === t.id}
									<span class="icon-btn__spinner" aria-hidden="true"></span>
								{:else}
									<i class="ri-file-copy-line" aria-hidden="true"></i>
								{/if}
							</button>
							<button
								class="icon-btn icon-btn--danger"
								type="button"
								aria-label="Delete {t.name}"
								title="Delete"
								onclick={() => askDelete(t)}
							>
								<i class="ri-delete-bin-line" aria-hidden="true"></i>
							</button>
						</div>
					</div>

					<button class="card__open" type="button" onclick={() => openEditor(t.id)}>
						<span class="card__name">{t.name}</span>
						{#if t.description}
							<span class="card__sub">{t.description}</span>
						{/if}
					</button>

					<div class="card__chips">
						<span class="chip">
							<i class="ri-flag-line" aria-hidden="true"></i>
							{t.milestoneCount}
							{t.milestoneCount === 1 ? 'milestone' : 'milestones'}
						</span>
						<span class="chip">
							<i class="ri-list-check-2" aria-hidden="true"></i>
							{t.itemCount}
							{t.itemCount === 1 ? 'item' : 'items'}
						</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Create template -->
<Modal open={createOpen} title="New template" onclose={closeCreate}>
	<form id="create-template-form" class="form" onsubmit={submitCreate} novalidate>
		{#if createError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{createError}</span>
			</div>
		{/if}

		<div class="form__field">
			<label class="form__label" for="create-template-name">Name</label>
			<input
				id="create-template-name"
				class="form__input"
				class:form__input--error={cFieldErrors.name}
				type="text"
				bind:value={cName}
				disabled={creating}
				placeholder="e.g. Landing Page"
				required
			/>
			{#if cFieldErrors.name}
				<p class="form__error">{cFieldErrors.name}</p>
			{/if}
		</div>

		<div class="form__field">
			<label class="form__label" for="create-template-icon">Icon</label>
			<div class="icon-field">
				<span class="icon-field__preview">
					<i class={cIcon.trim() || DEFAULT_ICON} aria-hidden="true"></i>
				</span>
				<input
					id="create-template-icon"
					class="form__input"
					class:form__input--error={cFieldErrors.icon}
					type="text"
					autocapitalize="none"
					spellcheck="false"
					bind:value={cIcon}
					disabled={creating}
					placeholder="ri-file-list-3-line"
				/>
			</div>
			{#if cFieldErrors.icon}
				<p class="form__error">{cFieldErrors.icon}</p>
			{:else}
				<p class="form__hint">
					A RemixIcon class name. Browse names at remixicon.com. Leave blank for the default.
				</p>
			{/if}
		</div>
	</form>

	{#snippet footer()}
		<button class="btn btn--secondary" type="button" onclick={closeCreate} disabled={creating}>
			Cancel
		</button>
		<button class="btn btn--brand" type="submit" form="create-template-form" disabled={creating}>
			{#if creating}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Creating…</span>
			{:else}
				<i class="ri-add-line" aria-hidden="true"></i>
				<span>Create template</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Delete template -->
<Modal open={deleteOpen} title="Delete template" onclose={closeDelete}>
	<div class="confirm">
		<i class="ri-error-warning-line confirm__icon" aria-hidden="true"></i>
		<p class="confirm__text">
			Permanently delete <strong>{deleteTarget?.name}</strong>? This can't be undone. Projects you
			already created from it are not affected.
		</p>
		{#if deleteError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{deleteError}</span>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<button class="btn btn--secondary" type="button" onclick={closeDelete} disabled={deleting}>
			Cancel
		</button>
		<button class="btn btn--danger" type="button" onclick={confirmDelete} disabled={deleting}>
			{#if deleting}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Deleting…</span>
			{:else}
				<i class="ri-delete-bin-line" aria-hidden="true"></i>
				<span>Delete template</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Confirm reordering -->
<ReorderConfirmModal controller={reorder} noun="your templates" />

<style lang="scss">
	.lib {
		&__head {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 16px;
			margin-bottom: 24px;
		}

		&__title {
			margin: 0 0 6px;
			font-size: 18px;
			font-weight: 600;
			color: var(--text-heading);
		}

		&__desc {
			margin: 0;
			max-width: 560px;
			font-size: 13px;
			line-height: 1.5;
			color: var(--text-body);
		}

		&__empty {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 12px;
			padding: 56px 24px;
			text-align: center;
			background-color: var(--neutral-primary-soft);
			border: 1px dashed var(--border-default-strong);
			border-radius: var(--radius-base);
		}

		&__empty-icon {
			font-size: 32px;
			color: var(--text-body-subtle);
		}

		&__empty-text {
			margin: 0;
			font-size: 14px;
			color: var(--text-body);
		}
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 16px;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 18px;
		background-color: var(--neutral-primary-soft);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);

		&--skel {
			gap: 12px;
		}

		&__top {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		&__handle {
			display: inline-flex;
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

		&__icon {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 40px;
			height: 40px;
			font-size: 22px;
			color: var(--fg-brand);
			background-color: var(--brand-softer, var(--neutral-secondary-medium));
			border-radius: var(--radius-base);
		}

		&__menu {
			display: flex;
			gap: 4px;
			margin-left: auto;
		}

		&__open {
			display: flex;
			flex-direction: column;
			gap: 4px;
			padding: 0;
			text-align: left;
			background-color: transparent;
			border: none;
			cursor: pointer;
		}

		&__name {
			font-size: 15px;
			font-weight: 600;
			color: var(--text-heading);

			.card__open:hover & {
				text-decoration: underline;
			}
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

		&__chips {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin-top: auto;
		}
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 10px;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-body);
		background-color: var(--neutral-secondary-medium);
		border-radius: var(--radius-full);

		i {
			font-size: 13px;
			color: var(--text-body-subtle);
		}
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

		&:disabled {
			cursor: not-allowed;
			opacity: 0.7;
		}

		&:focus-visible {
			outline: none;
			box-shadow: 0 0 0 3px var(--brand-medium);
		}

		&--danger:hover:not(:disabled) {
			color: var(--fg-danger);
			background-color: var(--danger-soft);
		}

		&__spinner {
			width: 15px;
			height: 15px;
			border: 2px solid var(--neutral-tertiary-medium);
			border-top-color: currentColor;
			border-radius: var(--radius-full);
			animation: cj-spin 700ms linear infinite;
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

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 16px;
		font-family: inherit;
		font-size: 14px;
		font-weight: 500;
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
