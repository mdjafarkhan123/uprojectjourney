<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { Select } from 'bits-ui';
	import Modal from '$lib/components/Modal.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import PublicShareFields from '$lib/components/PublicShareFields.svelte';
	import { query } from '$lib/data/cache.svelte';
	import { PROJECT_TEMPLATES, type TemplateKey } from '$lib/templates';

	type Project = {
		id: string;
		name: string;
		client_name: string;
		status: 'planning' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';
		progress: number;
		created_at: string;
		public_slug: string | null;
		is_public: boolean;
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
	let createdAt = $state<string | null>(null);
	let creating = $state(false);
	let createError = $state('');
	let fieldErrors = $state<{
		name?: string;
		templateKey?: string;
		clientId?: string;
		createdAt?: string;
		publicSlug?: string;
	}>({});
	// Optional public sharing set at creation time (mirrors the Edit-project flow).
	let publicSlug = $state('');
	let isPublic = $state(false);

	// Local "today" as an ISO date ("yyyy-mm-dd"), used to pre-fill the picker.
	function todayIso(): string {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

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
		createdAt = todayIso();
		publicSlug = '';
		isPublic = false;
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
				body: JSON.stringify({
					name,
					clientId,
					templateKey,
					isPublic,
					publicSlug,
					...(createdAt ? { createdAt } : {})
				})
			});

			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				const errs = payload.errors ?? {};
				fieldErrors = {
					name: errs.name?.[0],
					templateKey: errs.templateKey?.[0],
					clientId: errs.clientId?.[0],
					createdAt: errs.createdAt?.[0],
					publicSlug: errs.publicSlug?.[0]
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

	// --- Create client sub-flow (from inside the project modal) ---
	// Lets the admin add a client without leaving the "New project" flow. We close
	// the project modal, open the client modal, then reopen the project modal with
	// the typed project fields still intact and the new client pre-selected.
	let clientCreateOpen = $state(false);
	let cFullName = $state('');
	let cUsername = $state('');
	let cPassword = $state('');
	let cCreating = $state(false);
	let cCreateError = $state('');
	let cFieldErrors = $state<{ fullName?: string; username?: string; password?: string }>({});

	function openClientCreate() {
		cFullName = '';
		cUsername = '';
		cPassword = '';
		cCreateError = '';
		cFieldErrors = {};
		createOpen = false;
		clientCreateOpen = true;
	}

	function closeClientCreate() {
		if (cCreating) return;
		clientCreateOpen = false;
		// Return to the project form, preserving whatever was already typed.
		createOpen = true;
	}

	async function submitClientCreate(event: SubmitEvent) {
		event.preventDefault();
		if (cCreating) return;

		cCreating = true;
		cCreateError = '';
		cFieldErrors = {};

		try {
			const res = await fetch('/api/clients', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ fullName: cFullName, username: cUsername, password: cPassword })
			});

			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				const errs = payload.errors ?? {};
				cFieldErrors = {
					fullName: errs.fullName?.[0],
					username: errs.username?.[0],
					password: errs.password?.[0]
				};
				cCreateError = payload.message ?? 'Something went wrong. Please try again.';
				cCreating = false;
				return;
			}

			const newClient = payload.client as Client;
			// Shared cache with the Clients page — patch it so the client shows everywhere.
			clientsQ.set((cur) => [newClient, ...(cur ?? [])]);
			// Pre-select the new client and hand control back to the project form.
			clientId = newClient.id;
			cCreating = false;
			clientCreateOpen = false;
			createOpen = true;
		} catch {
			cCreateError = 'Could not reach the server. Please try again.';
			cCreating = false;
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

	// --- Public link (compact display + copy) ---
	// The admin's login username namespaces every public link: /p/<username>/<slug>.
	const adminUsername = $derived(page.data.user?.username ?? '');

	function shareUrl(project: Project): string {
		if (!project.is_public || !project.public_slug || !adminUsername) return '';
		return `${page.url.origin}/p/${adminUsername}/${project.public_slug}`;
	}

	// Tracks which project's link was just copied, to flash the "Copied" state.
	let copiedId = $state<string | null>(null);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	async function copyShareUrl(project: Project) {
		const url = shareUrl(project);
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			copiedId = project.id;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copiedId = null), 1500);
		} catch {
			copiedId = null;
		}
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
								{#if project.is_public && project.public_slug}
									<span class="public-link">
										<i class="ri-global-line public-link__icon" aria-hidden="true"></i>
										<span class="public-link__slug" title={shareUrl(project)}>
											/p/{adminUsername}/{project.public_slug}
										</span>
										<button
											type="button"
											class="public-link__copy"
											onclick={(e) => {
												e.stopPropagation();
												copyShareUrl(project);
											}}
											aria-label="Copy public link for {project.name}"
											title="Copy public link"
										>
											{#if copiedId === project.id}
												<i class="ri-check-line" aria-hidden="true"></i>
											{:else}
												<i class="ri-file-copy-line" aria-hidden="true"></i>
											{/if}
										</button>
									</span>
								{/if}
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
				<div class="callout">
					<i class="ri-user-add-line callout__icon" aria-hidden="true"></i>
					<div class="callout__body">
						<p class="callout__text">
							You need an active client before you can create a project. You can add one here...
						</p>
						<button
							class="btn btn--brand btn--sm"
							type="button"
							onclick={openClientCreate}
							disabled={creating}
						>
							<i class="ri-add-line" aria-hidden="true"></i>
							<span>Create a client</span>
						</button>
					</div>
				</div>
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

		<div class="form__field">
			<label class="form__label" for="create-project-created-at">Creation date</label>
			<DatePicker
				id="create-project-created-at"
				value={createdAt}
				onChange={(v) => (createdAt = v)}
				disabled={creating}
				ariaLabel="Project creation date"
			/>
			{#if fieldErrors.createdAt}
				<p class="form__error">{fieldErrors.createdAt}</p>
			{:else}
				<p class="form__hint">Defaults to today. Set an earlier date to backdate the project.</p>
			{/if}
		</div>

		<PublicShareFields
			bind:slug={publicSlug}
			bind:isPublic
			projectId={null}
			disabled={creating}
			serverError={fieldErrors.publicSlug}
		/>
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

<!-- Create client (from the project flow) -->
<Modal open={clientCreateOpen} title="New client" onclose={closeClientCreate}>
	<form id="create-client-inline-form" class="form" onsubmit={submitClientCreate} novalidate>
		{#if cCreateError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{cCreateError}</span>
			</div>
		{/if}

		<div class="form__field">
			<label class="form__label" for="create-client-fullname">Full name</label>
			<input
				id="create-client-fullname"
				class="form__input"
				class:form__input--error={cFieldErrors.fullName}
				type="text"
				autocomplete="name"
				bind:value={cFullName}
				disabled={cCreating}
				required
			/>
			{#if cFieldErrors.fullName}
				<p class="form__error">{cFieldErrors.fullName}</p>
			{/if}
		</div>

		<div class="form__field">
			<label class="form__label" for="create-client-username">Username</label>
			<input
				id="create-client-username"
				class="form__input"
				class:form__input--error={cFieldErrors.username}
				type="text"
				autocomplete="off"
				autocapitalize="none"
				spellcheck="false"
				bind:value={cUsername}
				disabled={cCreating}
				required
			/>
			{#if cFieldErrors.username}
				<p class="form__error">{cFieldErrors.username}</p>
			{:else}
				<p class="form__hint">The client signs in with this. Letters, numbers, and . _ -</p>
			{/if}
		</div>

		<div class="form__field">
			<label class="form__label" for="create-client-password">Password</label>
			<input
				id="create-client-password"
				class="form__input"
				class:form__input--error={cFieldErrors.password}
				type="password"
				autocomplete="new-password"
				bind:value={cPassword}
				disabled={cCreating}
				required
			/>
			{#if cFieldErrors.password}
				<p class="form__error">{cFieldErrors.password}</p>
			{:else}
				<p class="form__hint">At least 8 characters.</p>
			{/if}
		</div>
	</form>

	{#snippet footer()}
		<button
			class="btn btn--secondary"
			type="button"
			onclick={closeClientCreate}
			disabled={cCreating}
		>
			Back
		</button>
		<button
			class="btn btn--brand"
			type="submit"
			form="create-client-inline-form"
			disabled={cCreating}
		>
			{#if cCreating}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Creating…</span>
			{:else}
				<i class="ri-add-line" aria-hidden="true"></i>
				<span>Create client</span>
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

	.public-link {
		display: flex;
		align-items: center;
		gap: 6px;
		width: fit-content;
		max-width: 240px;
		margin-top: 6px;
		padding: 3px 6px 3px 8px;
		font-weight: 400;
		background-color: var(--neutral-secondary-soft);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-full);

		&__icon {
			flex-shrink: 0;
			font-size: 13px;
			color: var(--fg-brand);
		}

		&__slug {
			overflow: hidden;
			font-size: 12px;
			color: var(--text-body);
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&__copy {
			display: inline-flex;
			flex-shrink: 0;
			align-items: center;
			justify-content: center;
			width: 22px;
			height: 22px;
			padding: 0;
			color: var(--text-body);
			background-color: transparent;
			border: none;
			border-radius: var(--radius-full);
			cursor: pointer;
			transition: all 200ms;

			i {
				font-size: 14px;
			}

			&:hover {
				color: var(--fg-brand);
				background-color: var(--neutral-tertiary-medium);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 2px var(--brand-medium);
			}
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

	.callout {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px;
		background-color: var(--neutral-secondary-soft);
		border: 1px dashed var(--border-default-strong);
		border-radius: var(--radius-base);

		&__icon {
			flex-shrink: 0;
			font-size: 20px;
			color: var(--fg-brand);
		}

		&__body {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: 10px;
		}

		&__text {
			margin: 0;
			font-size: 13px;
			line-height: 1.5;
			color: var(--text-body);
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
