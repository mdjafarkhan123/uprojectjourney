<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { Select } from 'bits-ui';
	import Modal from '$lib/components/Modal.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { query } from '$lib/data/cache.svelte';
	import { PROJECT_TEMPLATES, type TemplateKey } from '$lib/templates';

	type Project = {
		id: string;
		name: string;
		client_name: string;
		status: 'planning' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';
		progress: number;
		created_at: string;
	};

	type Client = {
		id: string;
		full_name: string;
		username: string;
		status: 'active' | 'inactive';
		created_at: string;
	};

	// Pure CSR: content is client-fetched and cached (stale-while-revalidate).
	// We patch the cache directly after a create so the list updates instantly.
	const projectsQ = query<Project[]>('projects', async () => {
		const res = await fetch('/api/projects');
		if (!res.ok) throw new Error('Could not load projects.');
		const body = await res.json();
		return body.projects as Project[];
	});

	// Shares the same cache entry as the Clients page (get-or-create by key).
	const clientsQ = query<Client[]>('clients', async () => {
		const res = await fetch('/api/clients');
		if (!res.ok) throw new Error('Could not load clients.');
		const body = await res.json();
		return body.clients as Client[];
	});

	// --- Create modal ---
	let createOpen = $state(false);
	let name = $state('');
	let templateKey = $state<TemplateKey | ''>('');
	let clientId = $state('');
	let creating = $state(false);
	let createError = $state('');
	let fieldErrors = $state<{ name?: string; templateKey?: string; clientId?: string }>({});

	const templateItems = PROJECT_TEMPLATES.map((t) => ({ value: t.key, label: t.label }));
	const activeClients = $derived((clientsQ.data ?? []).filter((c) => c.status === 'active'));
	const clientItems = $derived(activeClients.map((c) => ({ value: c.id, label: c.full_name })));

	const selectedTemplateLabel = $derived(
		templateItems.find((t) => t.value === templateKey)?.label ?? ''
	);
	const selectedClientLabel = $derived(clientItems.find((c) => c.value === clientId)?.label ?? '');

	function openCreate() {
		name = '';
		templateKey = '';
		clientId = '';
		createError = '';
		fieldErrors = {};
		createOpen = true;
		// Make sure the client picker has options to show.
		clientsQ.load();
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
		fieldErrors = {};

		try {
			const res = await fetch('/api/projects', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, clientId, templateKey })
			});

			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				const errs = payload.errors ?? {};
				fieldErrors = {
					name: errs.name?.[0],
					templateKey: errs.templateKey?.[0],
					clientId: errs.clientId?.[0]
				};
				createError = payload.message ?? 'Something went wrong. Please try again.';
				creating = false;
				return;
			}

			projectsQ.set((cur) => [payload.project as Project, ...(cur ?? [])]);
			createOpen = false;
			creating = false;
		} catch {
			createError = 'Could not reach the server. Please try again.';
			creating = false;
		}
	}

	// --- Delete confirm modal ---
	let deleteProject = $state<Project | null>(null);
	let deletingProject = $state(false);
	let deleteError = $state('');

	const deleteOpen = $derived(deleteProject !== null);

	function askDelete(project: Project) {
		deleteProject = project;
		deleteError = '';
	}

	function closeDelete() {
		if (deletingProject) return;
		deleteProject = null;
	}

	async function confirmDelete() {
		if (deletingProject || !deleteProject) return;
		deletingProject = true;
		deleteError = '';
		const target = deleteProject;

		try {
			const res = await fetch(`/api/projects/${target.id}`, { method: 'DELETE' });

			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				deleteError = payload.message ?? 'Could not delete the project. Please try again.';
				deletingProject = false;
				return;
			}

			projectsQ.set((cur) => (cur ?? []).filter((p) => p.id !== target.id));
			deleteProject = null;
			deletingProject = false;
		} catch {
			deleteError = 'Could not reach the server. Please try again.';
			deletingProject = false;
		}
	}

	const skeletonRows = [0, 1, 2, 3, 4];

	const statusMeta: Record<Project['status'], { label: string; className: string }> = {
		planning: { label: 'Planning', className: 'badge--gray' },
		in_progress: { label: 'In progress', className: 'badge--progress' },
		waiting_for_client: { label: 'Waiting for client', className: 'badge--waiting' },
		under_review: { label: 'Under review', className: 'badge--review' },
		completed: { label: 'Completed', className: 'badge--success' }
	};

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Projects</title>
</svelte:head>

<section class="page">
	<header class="page__header">
		<div>
			<h1 class="page__heading">Projects</h1>
			<p class="page__subheading">Create a project from a template and track its journey.</p>
		</div>
		<button class="btn btn--brand" type="button" onclick={openCreate}>
			<i class="ri-add-line" aria-hidden="true"></i>
			<span>New project</span>
		</button>
	</header>

	{#if projectsQ.error}
		<div class="page__empty">
			<i class="ri-error-warning-line page__empty-icon" aria-hidden="true"></i>
			<p class="page__empty-text">{projectsQ.error}</p>
			<button class="btn btn--secondary" type="button" onclick={() => projectsQ.load()}>
				Try again
			</button>
		</div>
	{:else if projectsQ.data === undefined}
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th scope="col">Project</th>
						<th scope="col">Client</th>
						<th scope="col">Status</th>
						<th scope="col">Progress</th>
						<th scope="col">Created</th>
						<th scope="col" class="table__actions-col"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each skeletonRows as row (row)}
						<tr>
							<td><Skeleton width="160px" /></td>
							<td><Skeleton width="120px" /></td>
							<td><Skeleton width="84px" height="20px" radius="var(--radius-base)" /></td>
							<td><Skeleton width="120px" /></td>
							<td><Skeleton width="90px" /></td>
							<td class="table__actions"><Skeleton width="32px" height="32px" /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if projectsQ.data.length === 0}
		<div class="page__empty">
			<i class="ri-folder-line page__empty-icon" aria-hidden="true"></i>
			<p class="page__empty-text">No projects yet. Create your first one to get started.</p>
			<button class="btn btn--brand" type="button" onclick={openCreate}>
				<i class="ri-add-line" aria-hidden="true"></i>
				<span>New project</span>
			</button>
		</div>
	{:else}
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th scope="col">Project</th>
						<th scope="col">Client</th>
						<th scope="col">Status</th>
						<th scope="col">Progress</th>
						<th scope="col">Created</th>
						<th scope="col" class="table__actions-col"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each projectsQ.data as project (project.id)}
						<tr
							class="table__row table__row--clickable"
							onclick={() => goto(resolve(`/master/projects/${project.id}`))}
						>
							<th scope="row" class="table__row-header">
								<a
									class="table__link"
									href={resolve(`/master/projects/${project.id}`)}
									onclick={(e) => e.stopPropagation()}
								>
									{project.name}
								</a>
							</th>
							<td>{project.client_name}</td>
							<td>
								<span class="badge {statusMeta[project.status].className}">
									{statusMeta[project.status].label}
								</span>
							</td>
							<td>
								<div class="progress" aria-label="{project.progress}% complete">
									<div class="progress__track">
										<div class="progress__bar" style="width: {project.progress}%"></div>
									</div>
									<span class="progress__value">{project.progress}%</span>
								</div>
							</td>
							<td>{formatDate(project.created_at)}</td>
							<td class="table__actions">
								<button
									class="btn btn--sm btn--ghost-danger"
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										askDelete(project);
									}}
									aria-label="Delete {project.name}"
								>
									<i class="ri-delete-bin-line" aria-hidden="true"></i>
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<!-- Create project -->
<Modal open={createOpen} title="New project" onclose={closeCreate}>
	<form id="create-project-form" class="form" onsubmit={submitCreate} novalidate>
		{#if createError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{createError}</span>
			</div>
		{/if}

		<div class="form__field">
			<label class="form__label" for="create-project-name">Project name</label>
			<input
				id="create-project-name"
				class="form__input"
				class:form__input--error={fieldErrors.name}
				type="text"
				bind:value={name}
				disabled={creating}
				required
			/>
			{#if fieldErrors.name}
				<p class="form__error">{fieldErrors.name}</p>
			{/if}
		</div>

		<div class="form__field">
			<span class="form__label" id="create-project-template-label">Template</span>
			<Select.Root
				type="single"
				value={templateKey}
				onValueChange={(v) => (templateKey = v as TemplateKey)}
				items={templateItems}
				disabled={creating}
			>
				<Select.Trigger
					class={fieldErrors.templateKey
						? 'select__trigger select__trigger--error'
						: 'select__trigger'}
					aria-labelledby="create-project-template-label"
				>
					<span class:select__placeholder={!selectedTemplateLabel}>
						{selectedTemplateLabel || 'Choose a template'}
					</span>
					<i class="ri-arrow-down-s-line" aria-hidden="true"></i>
				</Select.Trigger>
				<Select.Portal>
					<Select.Content class="select__content">
						<Select.Viewport>
							{#each templateItems as item (item.value)}
								<Select.Item class="select__item" value={item.value} label={item.label}>
									{#snippet children({ selected })}
										<span>{item.label}</span>
										{#if selected}
											<i class="ri-check-line" aria-hidden="true"></i>
										{/if}
									{/snippet}
								</Select.Item>
							{/each}
						</Select.Viewport>
					</Select.Content>
				</Select.Portal>
			</Select.Root>
			{#if fieldErrors.templateKey}
				<p class="form__error">{fieldErrors.templateKey}</p>
			{:else}
				<p class="form__hint">
					Seeds the default milestones: Planning, Design, Development, Testing, Launch.
				</p>
			{/if}
		</div>

		<div class="form__field">
			<span class="form__label" id="create-project-client-label">Client</span>
			{#if clientItems.length === 0}
				<p class="form__hint">You have no active clients yet. Add one on the Clients page first.</p>
			{:else}
				<Select.Root
					type="single"
					value={clientId}
					onValueChange={(v) => (clientId = v)}
					items={clientItems}
					disabled={creating}
				>
					<Select.Trigger
						class={fieldErrors.clientId
							? 'select__trigger select__trigger--error'
							: 'select__trigger'}
						aria-labelledby="create-project-client-label"
					>
						<span class:select__placeholder={!selectedClientLabel}>
							{selectedClientLabel || 'Choose a client'}
						</span>
						<i class="ri-arrow-down-s-line" aria-hidden="true"></i>
					</Select.Trigger>
					<Select.Portal>
						<Select.Content class="select__content">
							<Select.Viewport>
								{#each clientItems as item (item.value)}
									<Select.Item class="select__item" value={item.value} label={item.label}>
										{#snippet children({ selected })}
											<span>{item.label}</span>
											{#if selected}
												<i class="ri-check-line" aria-hidden="true"></i>
											{/if}
										{/snippet}
									</Select.Item>
								{/each}
							</Select.Viewport>
						</Select.Content>
					</Select.Portal>
				</Select.Root>
			{/if}
			{#if fieldErrors.clientId}
				<p class="form__error">{fieldErrors.clientId}</p>
			{/if}
		</div>
	</form>

	{#snippet footer()}
		<button class="btn btn--secondary" type="button" onclick={closeCreate} disabled={creating}>
			Cancel
		</button>
		<button
			class="btn btn--brand"
			type="submit"
			form="create-project-form"
			disabled={creating || clientItems.length === 0}
		>
			{#if creating}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Creating…</span>
			{:else}
				<i class="ri-add-line" aria-hidden="true"></i>
				<span>Create project</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Delete project -->
<Modal open={deleteOpen} title="Delete project" onclose={closeDelete}>
	<div class="confirm">
		<i class="ri-error-warning-line confirm__icon" aria-hidden="true"></i>
		<p class="confirm__text">
			Permanently delete <strong>{deleteProject?.name}</strong>? This can't be undone. All of its
			milestones and timeline updates will be removed, and the client will no longer see this
			project.
		</p>
		{#if deleteError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{deleteError}</span>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<button
			class="btn btn--secondary"
			type="button"
			onclick={closeDelete}
			disabled={deletingProject}
		>
			Cancel
		</button>
		<button
			class="btn btn--danger"
			type="button"
			onclick={confirmDelete}
			disabled={deletingProject}
		>
			{#if deletingProject}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Deleting…</span>
			{:else}
				<i class="ri-delete-bin-line" aria-hidden="true"></i>
				<span>Delete project</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<style lang="scss">
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.page {
		&__header {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 16px;
			margin-bottom: 32px;
		}

		&__heading {
			margin: 0 0 8px;
			font-size: 24px;
			font-weight: 600;
			line-height: 1.25;
			color: var(--text-heading);
		}

		&__subheading {
			margin: 0;
			font-size: 14px;
			color: var(--text-body);
		}

		&__empty {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 12px;
			padding: 64px 24px;
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

	.table-wrap {
		overflow-x: auto;
		background-color: var(--neutral-primary-soft);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
		color: var(--text-body);
		text-align: left;

		thead th {
			padding: 12px 24px;
			font-weight: 500;
			color: var(--text-body);
			white-space: nowrap;
			background-color: var(--neutral-secondary-soft);
			border-bottom: 1px solid var(--border-default);
		}

		tbody tr {
			background-color: var(--neutral-primary);

			&:not(:last-child) {
				border-bottom: 1px solid var(--border-default);
			}

			&:hover {
				background-color: var(--neutral-secondary-soft);
			}
		}

		&__row--clickable {
			cursor: pointer;
		}

		tbody td {
			padding: 16px 24px;
			vertical-align: middle;
		}

		&__row-header {
			padding: 16px 24px;
			font-weight: 500;
			color: var(--text-heading);
			white-space: nowrap;
		}

		&__link {
			// color: var(--fg-brand-strong);
			text-decoration: none;

			&:hover {
				text-decoration: underline;
			}
		}

		&__actions-col {
			width: 1%;
		}

		&__actions {
			text-align: right;
			white-space: nowrap;
		}
	}

	.progress {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 140px;

		&__track {
			flex: 1;
			height: 6px;
			background-color: var(--neutral-tertiary-medium);
			border-radius: var(--radius-full);
			overflow: hidden;
		}

		&__bar {
			height: 100%;
			background-color: var(--brand);
			border-radius: var(--radius-full);
			transition: width 300ms ease;
		}

		&__value {
			font-size: 12px;
			font-variant-numeric: tabular-nums;
			color: var(--text-body);
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
			align-items: flex-start;
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

	// bits-ui Select. Trigger is in-flow; Content is portalled → styled globally.
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

	:global(.select__trigger--error) {
		border-color: var(--border-danger);
	}

	.select__placeholder {
		color: var(--text-body);
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
			padding: 8px 12px;
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

		&--ghost-danger {
			color: var(--text-body);
			background-color: transparent;
			border-color: var(--border-default-medium);

			&:hover:not(:disabled) {
				color: var(--fg-danger);
				background-color: var(--danger-soft);
				border-color: var(--border-danger);
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
