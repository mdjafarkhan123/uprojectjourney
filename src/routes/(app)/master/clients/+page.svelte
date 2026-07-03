<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { query } from '$lib/data/cache.svelte';

	type Client = {
		id: string;
		full_name: string;
		username: string;
		status: 'active' | 'inactive';
		created_at: string;
	};

	// Content is fetched client-side and cached (stale-while-revalidate): instant
	// on revisit, revalidated in the background when stale. We patch the cache
	// directly after each mutation so the list reflects changes immediately.
	const clientsQ = query<Client[]>('clients', async () => {
		const res = await fetch('/api/clients');
		if (!res.ok) throw new Error('Could not load clients.');
		const body = await res.json();
		return body.clients as Client[];
	});

	// --- Create modal ---
	let createOpen = $state(false);
	let fullName = $state('');
	let username = $state('');
	let password = $state('');
	let creating = $state(false);
	let createError = $state('');
	let fieldErrors = $state<{ fullName?: string; username?: string; password?: string }>({});

	function openCreate() {
		fullName = '';
		username = '';
		password = '';
		createError = '';
		fieldErrors = {};
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
		fieldErrors = {};

		try {
			const res = await fetch('/api/clients', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ fullName, username, password })
			});

			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				const errs = payload.errors ?? {};
				fieldErrors = {
					fullName: errs.fullName?.[0],
					username: errs.username?.[0],
					password: errs.password?.[0]
				};
				createError = payload.message ?? 'Something went wrong. Please try again.';
				creating = false;
				return;
			}

			clientsQ.set((cur) => [payload.client as Client, ...(cur ?? [])]);
			createOpen = false;
			creating = false;
		} catch {
			createError = 'Could not reach the server. Please try again.';
			creating = false;
		}
	}

	// --- Deactivate confirm modal ---
	let confirmClient = $state<Client | null>(null);
	let confirmError = $state('');
	let deactivating = $state(false);

	function askDeactivate(client: Client) {
		confirmClient = client;
		confirmError = '';
	}

	function closeConfirm() {
		if (deactivating) return;
		confirmClient = null;
	}

	async function confirmDeactivate() {
		if (!confirmClient || deactivating) return;
		deactivating = true;
		confirmError = '';
		const target = confirmClient;

		try {
			const res = await fetch(`/api/clients/${target.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: 'inactive' })
			});
			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				confirmError = payload.message ?? 'Could not deactivate the client.';
				deactivating = false;
				return;
			}

			clientsQ.set((cur) =>
				(cur ?? []).map((c) => (c.id === target.id ? (payload.client as Client) : c))
			);
			confirmClient = null;
			deactivating = false;
		} catch {
			confirmError = 'Could not reach the server. Please try again.';
			deactivating = false;
		}
	}

	// --- Reactivate (inline, no confirm) ---
	let busyId = $state<string | null>(null);

	async function reactivate(client: Client) {
		if (busyId) return;
		busyId = client.id;
		try {
			const res = await fetch(`/api/clients/${client.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: 'active' })
			});
			const payload = await res.json().catch(() => ({}));
			if (res.ok) {
				clientsQ.set((cur) =>
					(cur ?? []).map((c) => (c.id === client.id ? (payload.client as Client) : c))
				);
			}
		} finally {
			busyId = null;
		}
	}

	// --- Edit modal ---
	let editClient = $state<Client | null>(null);
	let eFullName = $state('');
	let eUsername = $state('');
	let ePassword = $state('');
	let savingEdit = $state(false);
	let editError = $state('');
	let editFieldErrors = $state<{ fullName?: string; username?: string; password?: string }>({});

	const editOpen = $derived(editClient !== null);

	function openEdit(client: Client) {
		editClient = client;
		eFullName = client.full_name;
		eUsername = client.username;
		ePassword = '';
		editError = '';
		editFieldErrors = {};
	}

	function closeEdit() {
		if (savingEdit) return;
		editClient = null;
	}

	async function submitEdit(event: SubmitEvent) {
		event.preventDefault();
		if (savingEdit || !editClient) return;
		savingEdit = true;
		editError = '';
		editFieldErrors = {};
		const target = editClient;

		// Only send a password when the admin actually typed a new one.
		const body: { fullName: string; username: string; password?: string } = {
			fullName: eFullName,
			username: eUsername
		};
		if (ePassword.trim()) body.password = ePassword;

		try {
			const res = await fetch(`/api/clients/${target.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				const errs = payload.errors ?? {};
				editFieldErrors = {
					fullName: errs.fullName?.[0],
					username: errs.username?.[0],
					password: errs.password?.[0]
				};
				editError = payload.message ?? 'Something went wrong. Please try again.';
				savingEdit = false;
				return;
			}

			clientsQ.set((cur) =>
				(cur ?? []).map((c) => (c.id === target.id ? (payload.client as Client) : c))
			);
			editClient = null;
			savingEdit = false;
		} catch {
			editError = 'Could not reach the server. Please try again.';
			savingEdit = false;
		}
	}

	// --- Delete confirm modal ---
	let deleteClient = $state<Client | null>(null);
	let deletingClient = $state(false);
	let deleteClientError = $state('');

	const deleteOpen = $derived(deleteClient !== null);

	function askDelete(client: Client) {
		deleteClient = client;
		deleteClientError = '';
	}

	function closeDelete() {
		if (deletingClient) return;
		deleteClient = null;
	}

	async function confirmDelete() {
		if (deletingClient || !deleteClient) return;
		deletingClient = true;
		deleteClientError = '';
		const target = deleteClient;

		try {
			const res = await fetch(`/api/clients/${target.id}`, { method: 'DELETE' });
			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				// 409 when the client still has projects — show the reason, keep the modal open.
				deleteClientError = payload.message ?? 'Could not delete the client. Please try again.';
				deletingClient = false;
				return;
			}

			clientsQ.set((cur) => (cur ?? []).filter((c) => c.id !== target.id));
			deleteClient = null;
			deletingClient = false;
		} catch {
			deleteClientError = 'Could not reach the server. Please try again.';
			deletingClient = false;
		}
	}

	// Fixed set of placeholder rows shown while the list is loading.
	const skeletonRows = [0, 1, 2, 3, 4];

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Clients</title>
</svelte:head>

<section class="page">
	<header class="page__header">
		<div>
			<h1 class="page__heading">Clients</h1>
			<p class="page__subheading">Create and manage the people who follow your projects.</p>
		</div>
		<button class="btn btn--brand" type="button" onclick={openCreate}>
			<i class="ri-add-line" aria-hidden="true"></i>
			<span>New client</span>
		</button>
	</header>

	{#if clientsQ.error}
		<div class="page__empty">
			<i class="ri-error-warning-line page__empty-icon" aria-hidden="true"></i>
			<p class="page__empty-text">{clientsQ.error}</p>
			<button class="btn btn--secondary" type="button" onclick={() => clientsQ.load()}>
				Try again
			</button>
		</div>
	{:else if clientsQ.data === undefined}
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th scope="col">Name</th>
						<th scope="col">Username</th>
						<th scope="col">Status</th>
						<th scope="col">Created</th>
						<th scope="col" class="table__actions-col"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each skeletonRows as row (row)}
						<tr>
							<td><Skeleton width="140px" /></td>
							<td><Skeleton width="100px" /></td>
							<td><Skeleton width="64px" height="20px" radius="var(--radius-base)" /></td>
							<td><Skeleton width="90px" /></td>
							<td class="table__actions"><Skeleton width="88px" height="32px" /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if clientsQ.data.length === 0}
		<div class="page__empty">
			<i class="ri-team-line page__empty-icon" aria-hidden="true"></i>
			<p class="page__empty-text">No clients yet. Create your first one to get started.</p>
		</div>
	{:else}
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th scope="col">Name</th>
						<th scope="col">Username</th>
						<th scope="col">Status</th>
						<th scope="col">Created</th>
						<th scope="col" class="table__actions-col"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each clientsQ.data as client (client.id)}
						<tr>
							<th scope="row" class="table__row-header">{client.full_name}</th>
							<td>{client.username}</td>
							<td>
								{#if client.status === 'active'}
									<span class="badge badge--success">Active</span>
								{:else}
									<span class="badge badge--gray">Inactive</span>
								{/if}
							</td>
							<td>{formatDate(client.created_at)}</td>
							<td class="table__actions">
								<div class="table__actions-row">
									<button
										class="btn btn--sm btn--secondary"
										type="button"
										onclick={() => openEdit(client)}
									>
										<i class="ri-edit-line" aria-hidden="true"></i>
										<span>Edit</span>
									</button>
									{#if client.status === 'active'}
										<button
											class="btn btn--sm btn--secondary"
											type="button"
											onclick={() => askDeactivate(client)}
										>
											Deactivate
										</button>
									{:else}
										<button
											class="btn btn--sm btn--secondary"
											type="button"
											disabled={busyId === client.id}
											onclick={() => reactivate(client)}
										>
											{#if busyId === client.id}
												<span class="btn__spinner" aria-hidden="true"></span>
												<span>Working…</span>
											{:else}
												Reactivate
											{/if}
										</button>
									{/if}
									<button
										class="btn btn--sm btn--ghost-danger"
										type="button"
										onclick={() => askDelete(client)}
										aria-label="Delete {client.full_name}"
									>
										<i class="ri-delete-bin-line" aria-hidden="true"></i>
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<!-- Create client -->
<Modal open={createOpen} title="New client" onclose={closeCreate}>
	<form id="create-client-form" class="form" onsubmit={submitCreate} novalidate>
		{#if createError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{createError}</span>
			</div>
		{/if}

		<div class="form__field">
			<label class="form__label" for="create-fullname">Full name</label>
			<input
				id="create-fullname"
				class="form__input"
				class:form__input--error={fieldErrors.fullName}
				type="text"
				autocomplete="name"
				bind:value={fullName}
				disabled={creating}
				required
			/>
			{#if fieldErrors.fullName}
				<p class="form__error">{fieldErrors.fullName}</p>
			{/if}
		</div>

		<div class="form__field">
			<label class="form__label" for="create-username">Username</label>
			<input
				id="create-username"
				class="form__input"
				class:form__input--error={fieldErrors.username}
				type="text"
				autocomplete="off"
				autocapitalize="none"
				spellcheck="false"
				bind:value={username}
				disabled={creating}
				required
			/>
			{#if fieldErrors.username}
				<p class="form__error">{fieldErrors.username}</p>
			{:else}
				<p class="form__hint">The client signs in with this. Letters, numbers, and . _ -</p>
			{/if}
		</div>

		<div class="form__field">
			<label class="form__label" for="create-password">Password</label>
			<input
				id="create-password"
				class="form__input"
				class:form__input--error={fieldErrors.password}
				type="password"
				autocomplete="new-password"
				bind:value={password}
				disabled={creating}
				required
			/>
			{#if fieldErrors.password}
				<p class="form__error">{fieldErrors.password}</p>
			{:else}
				<p class="form__hint">At least 8 characters.</p>
			{/if}
		</div>
	</form>

	{#snippet footer()}
		<button class="btn btn--secondary" type="button" onclick={closeCreate} disabled={creating}>
			Cancel
		</button>
		<button class="btn btn--brand" type="submit" form="create-client-form" disabled={creating}>
			{#if creating}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Creating…</span>
			{:else}
				<i class="ri-add-line" aria-hidden="true"></i>
				<span>Create client</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Deactivate confirm -->
<Modal open={confirmClient !== null} title="Deactivate client" onclose={closeConfirm}>
	<div class="confirm">
		<i class="ri-error-warning-line confirm__icon" aria-hidden="true"></i>
		<p class="confirm__text">
			Deactivate <strong>{confirmClient?.full_name}</strong>? They'll be signed out immediately and
			won't be able to log in until reactivated.
		</p>
		{#if confirmError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{confirmError}</span>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<button class="btn btn--secondary" type="button" onclick={closeConfirm} disabled={deactivating}>
			Cancel
		</button>
		<button
			class="btn btn--danger"
			type="button"
			onclick={confirmDeactivate}
			disabled={deactivating}
		>
			{#if deactivating}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Deactivating…</span>
			{:else}
				<span>Deactivate</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Edit client -->
<Modal open={editOpen} title="Edit client" onclose={closeEdit}>
	<form id="edit-client-form" class="form" onsubmit={submitEdit} novalidate>
		{#if editError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{editError}</span>
			</div>
		{/if}

		<div class="form__field">
			<label class="form__label" for="edit-fullname">Full name</label>
			<input
				id="edit-fullname"
				class="form__input"
				class:form__input--error={editFieldErrors.fullName}
				type="text"
				autocomplete="name"
				bind:value={eFullName}
				disabled={savingEdit}
				required
			/>
			{#if editFieldErrors.fullName}
				<p class="form__error">{editFieldErrors.fullName}</p>
			{/if}
		</div>

		<div class="form__field">
			<label class="form__label" for="edit-username">Username</label>
			<input
				id="edit-username"
				class="form__input"
				class:form__input--error={editFieldErrors.username}
				type="text"
				autocomplete="off"
				autocapitalize="none"
				spellcheck="false"
				bind:value={eUsername}
				disabled={savingEdit}
				required
			/>
			{#if editFieldErrors.username}
				<p class="form__error">{editFieldErrors.username}</p>
			{:else}
				<p class="form__hint">Letters, numbers, and . _ -</p>
			{/if}
		</div>

		<div class="form__field">
			<label class="form__label" for="edit-password">New password</label>
			<input
				id="edit-password"
				class="form__input"
				class:form__input--error={editFieldErrors.password}
				type="password"
				autocomplete="new-password"
				bind:value={ePassword}
				disabled={savingEdit}
			/>
			{#if editFieldErrors.password}
				<p class="form__error">{editFieldErrors.password}</p>
			{:else}
				<p class="form__hint">Leave blank to keep the current password.</p>
			{/if}
		</div>
	</form>

	{#snippet footer()}
		<button class="btn btn--secondary" type="button" onclick={closeEdit} disabled={savingEdit}>
			Cancel
		</button>
		<button class="btn btn--brand" type="submit" form="edit-client-form" disabled={savingEdit}>
			{#if savingEdit}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Saving…</span>
			{:else}
				<i class="ri-check-line" aria-hidden="true"></i>
				<span>Save changes</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Delete client -->
<Modal open={deleteOpen} title="Delete client" onclose={closeDelete}>
	<div class="confirm">
		<i class="ri-error-warning-line confirm__icon" aria-hidden="true"></i>
		<p class="confirm__text">
			Permanently delete <strong>{deleteClient?.full_name}</strong>? This can't be undone. A client
			with projects can't be deleted until their projects are removed or reassigned.
		</p>
		{#if deleteClientError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{deleteClientError}</span>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<button
			class="btn btn--secondary"
			type="button"
			onclick={closeDelete}
			disabled={deletingClient}
		>
			Cancel
		</button>
		<button class="btn btn--danger" type="button" onclick={confirmDelete} disabled={deletingClient}>
			{#if deletingClient}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Deleting…</span>
			{:else}
				<i class="ri-delete-bin-line" aria-hidden="true"></i>
				<span>Delete client</span>
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

		&__actions-col {
			width: 1%;
		}

		&__actions {
			text-align: right;
			white-space: nowrap;
		}

		&__actions-row {
			display: inline-flex;
			align-items: center;
			gap: 8px;
		}
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 2px 6px;
		font-size: 12px;
		font-weight: 500;
		border: 1px solid transparent;
		border-radius: var(--radius-base);

		&--success {
			color: var(--fg-success);
			background-color: var(--success-soft);
			border-color: var(--border-success);
		}

		&--gray {
			color: var(--text-heading);
			background-color: var(--neutral-secondary-medium);
			border-color: var(--border-default);
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
