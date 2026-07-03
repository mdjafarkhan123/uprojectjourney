<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Select } from 'bits-ui';
	import Modal from '$lib/components/Modal.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { createQuery, mutate } from '$lib/data/cache.svelte';
	import { computeOverallProgress } from '$lib/progress';

	type ProjectStatus =
		'planning' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';
	type MilestoneStatus = 'not_started' | 'open' | 'in_progress' | 'completed';
	type TimelineStatus =
		'not_started' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';

	type TimelineUpdate = {
		id: string;
		title: string;
		description: string | null;
		status: TimelineStatus;
		required_action: string | null;
		entry_date: string;
		created_at: string;
	};

	type Milestone = {
		id: string;
		name: string;
		status: MilestoneStatus;
		progress: number;
		weight: number;
		scope_finalized: boolean;
		position: number;
		start_date: string | null;
		expected_completion_date: string | null;
		overview: string | null;
		timeline_updates: TimelineUpdate[];
	};

	type ProjectDetail = {
		id: string;
		name: string;
		client_id: string;
		client_name: string;
		status: ProjectStatus;
		expected_delivery_date: string | null;
		current_focus_title: string | null;
		current_focus_goal: string | null;
		created_at: string;
		updated_at: string;
		progress: number;
		milestones: Milestone[];
	};

	type ProjectListItem = {
		id: string;
		name: string;
		client_name: string;
		status: ProjectStatus;
		progress: number;
		created_at: string;
	};

	// Same cache key + fetcher as the project detail page, so drilling into a
	// milestone reuses the already-loaded project (instant, no refetch) and every
	// patch here is reflected on the project page too.
	const projectQ = createQuery<ProjectDetail>(
		() => `project:${page.params.id ?? ''}`,
		async (key) => {
			const id = key.slice('project:'.length);
			const res = await fetch(`/api/projects/${id}`);
			if (res.status === 404) throw new Error('Project not found.');
			if (!res.ok) throw new Error('Could not load the project.');
			const body = await res.json();
			return body.project as ProjectDetail;
		}
	);

	const milestoneStatusMeta: Record<MilestoneStatus, { label: string; className: string }> = {
		not_started: { label: 'Not started', className: 'badge--gray' },
		open: { label: 'Open', className: 'badge--open' },
		in_progress: { label: 'In progress', className: 'badge--progress' },
		completed: { label: 'Completed', className: 'badge--success' }
	};
	const milestoneStatusItems = (Object.keys(milestoneStatusMeta) as MilestoneStatus[]).map(
		(value) => ({ value, label: milestoneStatusMeta[value].label })
	);

	// How each internal status reads to the client in their portal (mirrors
	// `milestoneCaption` in $lib/portal/journey). The portal deliberately collapses
	// the internal "Open" vs "In progress" distinction into a single "In progress"
	// label — this hint keeps that projection visible to the admin so it never surprises.
	const clientFacingMilestoneLabel: Record<MilestoneStatus, string> = {
		not_started: 'Upcoming',
		open: 'In progress',
		in_progress: 'In progress',
		completed: 'Completed'
	};

	const timelineStatusMeta: Record<TimelineStatus, { label: string; className: string }> = {
		not_started: { label: 'Not started', className: 'badge--gray' },
		in_progress: { label: 'In progress', className: 'badge--progress' },
		waiting_for_client: { label: 'Waiting for client', className: 'badge--waiting' },
		under_review: { label: 'Under review', className: 'badge--review' },
		completed: { label: 'Completed', className: 'badge--success' }
	};
	const timelineStatusItems = (Object.keys(timelineStatusMeta) as TimelineStatus[]).map(
		(value) => ({
			value,
			label: timelineStatusMeta[value].label
		})
	);

	function todayIso(): string {
		const now = new Date();
		const y = now.getFullYear();
		const m = String(now.getMonth() + 1).padStart(2, '0');
		const d = String(now.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	// Oldest entry first; same-day ties break by creation time (mirrors the API).
	function sortTimeline(updates: TimelineUpdate[]): TimelineUpdate[] {
		return [...updates].sort((a, b) => {
			if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? -1 : 1;
			return a.created_at < b.created_at ? -1 : 1;
		});
	}

	function formatDate(iso: string | null): string {
		if (!iso) return '—';
		const [y, m, d] = iso.split('-').map(Number);
		if (!y || !m || !d) return '—';
		return new Date(y, m - 1, d).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function syncListCache(project: ProjectDetail) {
		mutate<ProjectListItem[]>('projects', (cur) =>
			(cur ?? []).map((p) =>
				p.id === project.id ? { ...p, progress: project.progress, status: project.status } : p
			)
		);
	}

	// The milestone this page is about, resolved from the shared project cache.
	const orderedMilestones = $derived(
		[...(projectQ.data?.milestones ?? [])].sort((a, b) => a.position - b.position)
	);
	const milestoneIndex = $derived(
		orderedMilestones.findIndex((m) => m.id === page.params.milestoneId)
	);
	const milestone = $derived(milestoneIndex >= 0 ? orderedMilestones[milestoneIndex] : null);
	// Distinguish "project still loading" from "loaded, but no such milestone".
	const notFound = $derived(projectQ.data !== undefined && milestone === null);

	const projectHref = $derived(resolve(`/master/projects/${page.params.id}`));

	// Replace one milestone's fields in the shared project cache (used by edits).
	function patchMilestone(milestoneId: string, patch: Partial<Milestone>) {
		const cur = projectQ.data;
		if (!cur) return;
		const milestones = cur.milestones.map((m) => (m.id === milestoneId ? { ...m, ...patch } : m));
		const next: ProjectDetail = {
			...cur,
			milestones,
			progress: computeOverallProgress(milestones)
		};
		projectQ.set(() => next);
		syncListCache(next);
	}

	// Patch this milestone's timeline list. A timeline change can auto-change the
	// milestone status AND its computed progress (server returns both) — apply those
	// and recompute the project's weighted overall so every view stays in sync.
	function patchTimeline(
		milestoneId: string,
		updater: (list: TimelineUpdate[]) => TimelineUpdate[],
		newStatus?: MilestoneStatus | null,
		newProgress?: number | null,
		newStartDate?: string | null
	) {
		const cur = projectQ.data;
		if (!cur) return;
		const milestones = cur.milestones.map((m) =>
			m.id === milestoneId
				? {
						...m,
						status: newStatus ?? m.status,
						progress: newProgress ?? m.progress,
						start_date: newStartDate ?? m.start_date,
						timeline_updates: sortTimeline(updater(m.timeline_updates))
					}
				: m
		);
		const next: ProjectDetail = {
			...cur,
			milestones,
			progress: computeOverallProgress(milestones)
		};
		projectQ.set(() => next);
		syncListCache(next);
	}

	// Draft vs Finalized. When finalized, the work-item checklist is locked: only an
	// item's STATUS can change (which is how progress advances). Add / delete / edit
	// of items requires clicking "Edit Scope" first.
	const scopeLocked = $derived(milestone?.scope_finalized ?? false);
	const totalItems = $derived(milestone?.timeline_updates.length ?? 0);
	const completedItems = $derived(
		milestone?.timeline_updates.filter((u) => u.status === 'completed').length ?? 0
	);

	let savingScope = $state(false);
	let scopeError = $state('');

	async function setScopeFinalized(finalized: boolean) {
		const m = milestone;
		if (savingScope || !m) return;
		savingScope = true;
		scopeError = '';
		try {
			const res = await fetch(`/api/milestones/${m.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ scopeFinalized: finalized })
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				scopeError = payload.message ?? 'Something went wrong. Please try again.';
				savingScope = false;
				return;
			}
			const updated = payload.milestone as Milestone;
			patchMilestone(updated.id, {
				scope_finalized: updated.scope_finalized,
				progress: updated.progress,
				status: updated.status
			});
			savingScope = false;
		} catch {
			scopeError = 'Could not reach the server. Please try again.';
			savingScope = false;
		}
	}

	// --- Edit milestone modal ---
	let editMilestoneOpen = $state(false);
	let savingMilestone = $state(false);
	let milestoneError = $state('');
	let milestoneFieldErrors = $state<{ name?: string }>({});
	let mName = $state('');
	let mStatus = $state<MilestoneStatus>('not_started');
	let mStart = $state<string | null>(null);
	let mCompletion = $state<string | null>(null);
	let mOverview = $state('');

	const selectedMilestoneStatusLabel = $derived(milestoneStatusMeta[mStatus].label);

	function openEditMilestone() {
		const m = milestone;
		if (!m) return;
		mName = m.name;
		mStatus = m.status;
		mStart = m.start_date;
		mCompletion = m.expected_completion_date;
		mOverview = m.overview ?? '';
		milestoneError = '';
		milestoneFieldErrors = {};
		editMilestoneOpen = true;
	}

	function closeEditMilestone() {
		if (savingMilestone) return;
		editMilestoneOpen = false;
	}

	async function submitEditMilestone(event: SubmitEvent) {
		event.preventDefault();
		if (savingMilestone || !milestone) return;

		savingMilestone = true;
		milestoneError = '';
		milestoneFieldErrors = {};

		try {
			const res = await fetch(`/api/milestones/${milestone.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: mName,
					status: mStatus,
					startDate: mStart,
					expectedCompletionDate: mCompletion,
					overview: mOverview
				})
			});
			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				milestoneFieldErrors = {
					name: payload.errors?.name?.[0]
				};
				milestoneError = payload.message ?? 'Something went wrong. Please try again.';
				savingMilestone = false;
				return;
			}

			const updated = payload.milestone as Omit<Milestone, 'timeline_updates'>;
			const patch: Partial<Milestone> = {
				name: updated.name,
				status: updated.status,
				weight: updated.weight,
				start_date: updated.start_date,
				expected_completion_date: updated.expected_completion_date,
				overview: updated.overview
			};
			// Completing a milestone cascades on the server: all its items become
			// `completed` and progress goes to 100%. Mirror that locally so the timeline
			// and progress reflect it instantly without a refetch.
			if (updated.status === 'completed') {
				patch.progress = updated.progress;
				patch.timeline_updates = (milestone?.timeline_updates ?? []).map((u) => ({
					...u,
					status: 'completed' as TimelineStatus,
					required_action: null
				}));
			}
			patchMilestone(updated.id, patch);
			editMilestoneOpen = false;
			savingMilestone = false;
		} catch {
			milestoneError = 'Could not reach the server. Please try again.';
			savingMilestone = false;
		}
	}

	// --- Add / edit timeline update modal (one modal serves both) ---
	let updateModalOpen = $state(false);
	let updateMode = $state<'create' | 'edit'>('create');
	let updateEditId = $state<string | null>(null);
	let savingUpdate = $state(false);
	let updateError = $state('');
	let updateFieldErrors = $state<{ title?: string; requiredAction?: string; entryDate?: string }>(
		{}
	);
	let uTitle = $state('');
	let uDescription = $state('');
	let uStatus = $state<TimelineStatus>('not_started');
	let uRequiredAction = $state('');
	let uEntryDate = $state<string | null>(null);

	const selectedTimelineStatusLabel = $derived(timelineStatusMeta[uStatus].label);
	const updateModalTitle = $derived(
		updateMode === 'create' ? 'Add timeline update' : 'Edit timeline update'
	);
	// When the scope is finalized, editing an existing item is limited to its status
	// (and the dependent required-action). All other fields are frozen.
	const updateFieldsLocked = $derived(scopeLocked && updateMode === 'edit');

	function openCreateUpdate() {
		updateMode = 'create';
		updateEditId = null;
		uTitle = '';
		uDescription = '';
		uStatus = 'not_started';
		uRequiredAction = '';
		uEntryDate = todayIso();
		updateError = '';
		updateFieldErrors = {};
		updateModalOpen = true;
	}

	function openEditUpdate(u: TimelineUpdate) {
		updateMode = 'edit';
		updateEditId = u.id;
		uTitle = u.title;
		uDescription = u.description ?? '';
		uStatus = u.status;
		uRequiredAction = u.required_action ?? '';
		uEntryDate = u.entry_date;
		updateError = '';
		updateFieldErrors = {};
		updateModalOpen = true;
	}

	function closeUpdateModal() {
		if (savingUpdate) return;
		updateModalOpen = false;
	}

	async function submitUpdate(event: SubmitEvent) {
		event.preventDefault();
		if (savingUpdate || !milestone) return;

		// Client-side mirror of the server rules (server still enforces both).
		const errors: { title?: string; requiredAction?: string; entryDate?: string } = {};
		if (!uTitle.trim()) errors.title = 'A title is required.';
		if (!uEntryDate) errors.entryDate = 'Pick a date for this entry.';
		if (uStatus === 'waiting_for_client' && !uRequiredAction.trim())
			errors.requiredAction = 'A Required Action message is needed while waiting for the client.';
		if (Object.keys(errors).length > 0) {
			updateFieldErrors = errors;
			return;
		}

		savingUpdate = true;
		updateError = '';
		updateFieldErrors = {};

		const milestoneId = milestone.id;
		const payload = {
			title: uTitle,
			description: uDescription,
			status: uStatus,
			requiredAction: uRequiredAction,
			entryDate: uEntryDate
		};

		try {
			const res =
				updateMode === 'create'
					? await fetch('/api/timeline-updates', {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ milestoneId, ...payload })
						})
					: await fetch(`/api/timeline-updates/${updateEditId}`, {
							method: 'PATCH',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify(payload)
						});
			const body = await res.json().catch(() => ({}));

			if (!res.ok) {
				updateFieldErrors = {
					title: body.errors?.title?.[0],
					requiredAction: body.errors?.requiredAction?.[0],
					entryDate: body.errors?.entryDate?.[0]
				};
				updateError = body.message ?? 'Something went wrong. Please try again.';
				savingUpdate = false;
				return;
			}

			const saved = body.update as TimelineUpdate;
			const newStatus = (body.milestoneStatus ?? null) as MilestoneStatus | null;
			const newProgress = (body.milestoneProgress ?? null) as number | null;
			const newStartDate = (body.milestoneStartDate ?? null) as string | null;
			if (updateMode === 'create') {
				patchTimeline(
					milestoneId,
					(list) => [...list, saved],
					newStatus,
					newProgress,
					newStartDate
				);
			} else {
				patchTimeline(
					milestoneId,
					(list) => list.map((u) => (u.id === saved.id ? saved : u)),
					newStatus,
					newProgress,
					newStartDate
				);
			}
			updateModalOpen = false;
			savingUpdate = false;
		} catch {
			updateError = 'Could not reach the server. Please try again.';
			savingUpdate = false;
		}
	}

	// --- Delete timeline update (confirm modal) ---
	let deleteTarget = $state<{ id: string; title: string } | null>(null);
	let deleting = $state(false);
	let deleteError = $state('');

	const deleteOpen = $derived(deleteTarget !== null);

	function openDelete(u: TimelineUpdate) {
		deleteTarget = { id: u.id, title: u.title };
		deleteError = '';
	}

	function closeDelete() {
		if (deleting) return;
		deleteTarget = null;
	}

	async function confirmDelete() {
		if (deleting || !deleteTarget || !milestone) return;
		const target = deleteTarget;
		const milestoneId = milestone.id;
		deleting = true;
		deleteError = '';

		try {
			const res = await fetch(`/api/timeline-updates/${target.id}`, { method: 'DELETE' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				deleteError = body.message ?? 'Could not delete the entry. Please try again.';
				deleting = false;
				return;
			}
			const newStatus = (body.milestoneStatus ?? null) as MilestoneStatus | null;
			const newProgress = (body.milestoneProgress ?? null) as number | null;
			const newStartDate = (body.milestoneStartDate ?? null) as string | null;
			patchTimeline(
				milestoneId,
				(list) => list.filter((u) => u.id !== target.id),
				newStatus,
				newProgress,
				newStartDate
			);
			deleteTarget = null;
			deleting = false;
		} catch {
			deleteError = 'Could not reach the server. Please try again.';
			deleting = false;
		}
	}

	const skeletonRows = [0, 1, 2];
</script>

<svelte:head>
	<title>{milestone?.name ?? 'Milestone'}</title>
</svelte:head>

<section class="page">
	<a class="page__back" href={projectHref}>
		<i class="ri-arrow-left-line" aria-hidden="true"></i>
		<span>{projectQ.data?.name ?? 'Project'}</span>
	</a>

	{#if projectQ.error}
		<div class="page__empty">
			<i class="ri-error-warning-line page__empty-icon" aria-hidden="true"></i>
			<p class="page__empty-text">{projectQ.error}</p>
			<button class="btn btn--secondary" type="button" onclick={() => projectQ.load()}>
				Try again
			</button>
		</div>
	{:else if notFound}
		<div class="page__empty">
			<i class="ri-error-warning-line page__empty-icon" aria-hidden="true"></i>
			<p class="page__empty-text">This milestone no longer exists.</p>
			<a class="btn btn--secondary" href={projectHref}>Back to project</a>
		</div>
	{:else if projectQ.data === undefined || !milestone}
		<div class="card header-card">
			<Skeleton width="240px" height="28px" />
			<Skeleton width="100%" height="8px" radius="var(--radius-full)" />
		</div>
		<div class="timeline card">
			{#each skeletonRows as row (row)}
				<Skeleton width="100%" height="18px" />
			{/each}
		</div>
	{:else}
		{@const m = milestone}
		<header class="header-card card">
			<div class="header-card__top">
				<div class="header-card__title">
					<span class="header-card__index">{milestoneIndex + 1}</span>
					<div>
						<h1 class="header-card__name">{m.name}</h1>
						<div class="header-card__badges">
							<span class="badge {milestoneStatusMeta[m.status].className}">
								{milestoneStatusMeta[m.status].label}
							</span>
							{#if milestoneStatusMeta[m.status].label !== clientFacingMilestoneLabel[m.status]}
								<span
									class="client-hint"
									title="This is how this status appears to your client in their portal."
								>
									<i class="ri-eye-line" aria-hidden="true"></i>
									Client sees “{clientFacingMilestoneLabel[m.status]}”
								</span>
							{/if}
							<span class="badge {m.scope_finalized ? 'badge--success' : 'badge--gray'}">
								<i class={m.scope_finalized ? 'ri-lock-line' : 'ri-draft-line'} aria-hidden="true"
								></i>
								{m.scope_finalized ? 'Scope finalized' : 'Draft scope'}
							</span>
						</div>
					</div>
				</div>
				<button class="btn btn--secondary" type="button" onclick={openEditMilestone}>
					<i class="ri-edit-line" aria-hidden="true"></i>
					<span>Edit milestone</span>
				</button>
			</div>

			<div class="header-card__progress">
				<div class="progress">
					<div class="progress__track">
						<div class="progress__bar" style="width: {m.progress}%"></div>
					</div>
					<span class="progress__value">{m.progress}%</span>
				</div>
				<span class="header-card__progress-label">
					Milestone progress · {completedItems} of {totalItems} items complete
				</span>
			</div>

			<div class="header-card__overall">
				<div class="progress progress--muted">
					<div class="progress__track">
						<div class="progress__bar" style="width: {projectQ.data?.progress ?? 0}%"></div>
					</div>
					<span class="progress__value">{projectQ.data?.progress ?? 0}%</span>
				</div>
				<span class="header-card__progress-label">Overall project progress</span>
			</div>

			{#if scopeError}
				<div class="form__alert" role="alert">
					<i class="ri-error-warning-line" aria-hidden="true"></i>
					<span>{scopeError}</span>
				</div>
			{/if}

			<div class="scope-bar" class:scope-bar--locked={m.scope_finalized}>
				<div class="scope-bar__text">
					<i
						class="scope-bar__icon {m.scope_finalized ? 'ri-lock-line' : 'ri-draft-line'}"
						aria-hidden="true"
					></i>
					<p class="scope-bar__desc">
						{#if m.scope_finalized}
							Scope is locked. Progress is tracking from the checklist — you can still update each
							item's status. To add, remove or rename items, edit the scope.
						{:else}
							Draft scope — build the work-item checklist below. Finalize when it's complete to
							start tracking progress.
						{/if}
					</p>
				</div>
				{#if m.scope_finalized}
					<button
						class="btn btn--secondary btn--sm"
						type="button"
						onclick={() => setScopeFinalized(false)}
						disabled={savingScope}
					>
						{#if savingScope}
							<span class="btn__spinner" aria-hidden="true"></span>
							<span>Unlocking…</span>
						{:else}
							<i class="ri-edit-2-line" aria-hidden="true"></i>
							<span>Edit Scope</span>
						{/if}
					</button>
				{:else}
					<button
						class="btn btn--brand btn--sm"
						type="button"
						onclick={() => setScopeFinalized(true)}
						disabled={savingScope || totalItems === 0}
					>
						{#if savingScope}
							<span class="btn__spinner" aria-hidden="true"></span>
							<span>Finalizing…</span>
						{:else}
							<i class="ri-lock-line" aria-hidden="true"></i>
							<span>Finalize Scope</span>
						{/if}
					</button>
				{/if}
			</div>

			<dl class="header-card__facts">
				<div class="fact">
					<dt class="fact__label">Weight</dt>
					<dd class="fact__value">{m.weight}% of project</dd>
				</div>
				<div class="fact">
					<dt class="fact__label">Start</dt>
					<dd class="fact__value">{formatDate(m.start_date)}</dd>
				</div>
				<div class="fact">
					<dt class="fact__label">Expected completion</dt>
					<dd class="fact__value">{formatDate(m.expected_completion_date)}</dd>
				</div>
				{#if m.overview}
					<div class="fact fact--wide">
						<dt class="fact__label">Overview</dt>
						<dd class="fact__value">{m.overview}</dd>
					</div>
				{/if}
			</dl>
		</header>

		<section class="timeline-section" aria-label="Timeline">
			<div class="timeline-section__head">
				<h2 class="timeline-section__heading">Timeline</h2>
				{#if scopeLocked}
					<span class="timeline-section__lock">
						<i class="ri-lock-line" aria-hidden="true"></i>
						<span>Scope locked</span>
					</span>
				{:else}
					<button class="btn btn--secondary btn--sm" type="button" onclick={openCreateUpdate}>
						<i class="ri-add-line" aria-hidden="true"></i>
						<span>Add update</span>
					</button>
				{/if}
			</div>

			<div class="card timeline">
				{#if m.timeline_updates.length === 0}
					<p class="timeline__empty">No updates yet. Add the first entry for this phase.</p>
				{:else}
					<ol class="timeline__list">
						{#each m.timeline_updates as u (u.id)}
							<li class="timeline__item">
								<div class="timeline__marker" aria-hidden="true"></div>
								<div class="timeline__body">
									<div class="timeline__row">
										<span class="timeline__date">{formatDate(u.entry_date)}</span>
										<span class="badge {timelineStatusMeta[u.status].className}">
											{timelineStatusMeta[u.status].label}
										</span>
										<div class="timeline__actions">
											<button
												class="icon-btn icon-btn--sm"
												type="button"
												onclick={() => openEditUpdate(u)}
												aria-label="Edit update {u.title}"
											>
												<i class="ri-edit-line" aria-hidden="true"></i>
											</button>
											{#if !scopeLocked}
												<button
													class="icon-btn icon-btn--sm icon-btn--danger"
													type="button"
													onclick={() => openDelete(u)}
													aria-label="Delete update {u.title}"
												>
													<i class="ri-delete-bin-line" aria-hidden="true"></i>
												</button>
											{/if}
										</div>
									</div>
									<p class="timeline__title">{u.title}</p>
									{#if u.description}
										<p class="timeline__desc">{u.description}</p>
									{/if}
									{#if u.status === 'waiting_for_client' && u.required_action}
										<div class="timeline__action-required" role="note">
											<i class="ri-alarm-warning-line" aria-hidden="true"></i>
											<div>
												<span class="timeline__action-label">Required from client</span>
												<p class="timeline__action-text">{u.required_action}</p>
											</div>
										</div>
									{/if}
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		</section>
	{/if}
</section>

<!-- Edit milestone -->
<Modal open={editMilestoneOpen} title="Edit milestone" onclose={closeEditMilestone}>
	<form id="edit-milestone-form" class="form" onsubmit={submitEditMilestone} novalidate>
		{#if milestoneError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{milestoneError}</span>
			</div>
		{/if}

		<div class="form__field">
			<label class="form__label" for="edit-milestone-name">Name</label>
			<input
				id="edit-milestone-name"
				class="form__input"
				class:form__input--error={milestoneFieldErrors.name}
				type="text"
				bind:value={mName}
				disabled={savingMilestone}
				required
			/>
			{#if milestoneFieldErrors.name}
				<p class="form__error">{milestoneFieldErrors.name}</p>
			{/if}
		</div>

		<div class="form__field">
			<span class="form__label" id="edit-milestone-status-label">Status</span>
			<Select.Root
				type="single"
				value={mStatus}
				onValueChange={(v) => (mStatus = v as MilestoneStatus)}
				items={milestoneStatusItems}
				disabled={savingMilestone}
			>
				<Select.Trigger class="select__trigger" aria-labelledby="edit-milestone-status-label">
					<span>{selectedMilestoneStatusLabel}</span>
					<i class="ri-arrow-down-s-line" aria-hidden="true"></i>
				</Select.Trigger>
				<Select.Portal>
					<Select.Content class="select__content">
						<Select.Viewport>
							{#each milestoneStatusItems as item (item.value)}
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
			<p class="form__hint">Auto-set from timeline activity; you can override it here.</p>
		</div>

		<div class="form__row">
			<div class="form__field">
				<label class="form__label" for="edit-milestone-start">Start date</label>
				<DatePicker
					id="edit-milestone-start"
					value={mStart}
					onChange={(v) => (mStart = v)}
					disabled={savingMilestone}
					ariaLabel="Milestone start date"
				/>
			</div>
			<div class="form__field">
				<label class="form__label" for="edit-milestone-completion">Expected completion</label>
				<DatePicker
					id="edit-milestone-completion"
					value={mCompletion}
					onChange={(v) => (mCompletion = v)}
					disabled={savingMilestone}
					ariaLabel="Milestone expected completion date"
				/>
			</div>
		</div>

		<div class="form__field">
			<label class="form__label" for="edit-milestone-overview">Overview</label>
			<textarea
				id="edit-milestone-overview"
				class="form__input form__textarea"
				bind:value={mOverview}
				disabled={savingMilestone}
				rows="3"
				placeholder="What happens in this phase"></textarea>
		</div>
	</form>

	{#snippet footer()}
		<button
			class="btn btn--secondary"
			type="button"
			onclick={closeEditMilestone}
			disabled={savingMilestone}
		>
			Cancel
		</button>
		<button
			class="btn btn--brand"
			type="submit"
			form="edit-milestone-form"
			disabled={savingMilestone}
		>
			{#if savingMilestone}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Saving…</span>
			{:else}
				<i class="ri-check-line" aria-hidden="true"></i>
				<span>Save changes</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Add / edit timeline update -->
<Modal open={updateModalOpen} title={updateModalTitle} onclose={closeUpdateModal}>
	<form id="timeline-form" class="form" onsubmit={submitUpdate} novalidate>
		{#if updateError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{updateError}</span>
			</div>
		{/if}

		{#if updateFieldsLocked}
			<div class="form__note" role="note">
				<i class="ri-lock-line" aria-hidden="true"></i>
				<span
					>Scope is finalized — only the status and date can be changed. Use Edit Scope to change
					the rest.</span
				>
			</div>
		{/if}

		<div class="form__field">
			<label class="form__label" for="timeline-title">Title</label>
			<input
				id="timeline-title"
				class="form__input"
				class:form__input--error={updateFieldErrors.title}
				type="text"
				bind:value={uTitle}
				disabled={savingUpdate || updateFieldsLocked}
				required
			/>
			{#if updateFieldErrors.title}
				<p class="form__error">{updateFieldErrors.title}</p>
			{/if}
		</div>

		<div class="form__row">
			<div class="form__field">
				<span class="form__label" id="timeline-status-label">Status</span>
				<Select.Root
					type="single"
					value={uStatus}
					onValueChange={(v) => (uStatus = v as TimelineStatus)}
					items={timelineStatusItems}
					disabled={savingUpdate}
				>
					<Select.Trigger class="select__trigger" aria-labelledby="timeline-status-label">
						<span>{selectedTimelineStatusLabel}</span>
						<i class="ri-arrow-down-s-line" aria-hidden="true"></i>
					</Select.Trigger>
					<Select.Portal>
						<Select.Content class="select__content">
							<Select.Viewport>
								{#each timelineStatusItems as item (item.value)}
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
			</div>

			<div class="form__field">
				<label class="form__label" for="timeline-date">Entry date</label>
				<DatePicker
					id="timeline-date"
					value={uEntryDate}
					onChange={(v) => (uEntryDate = v)}
					disabled={savingUpdate}
					ariaLabel="Timeline entry date"
				/>
				{#if updateFieldErrors.entryDate}
					<p class="form__error">{updateFieldErrors.entryDate}</p>
				{/if}
			</div>
		</div>

		<div class="form__field">
			<label class="form__label" for="timeline-desc">Description</label>
			<textarea
				id="timeline-desc"
				class="form__input form__textarea"
				bind:value={uDescription}
				disabled={savingUpdate || updateFieldsLocked}
				rows="3"
				placeholder="What happened in this update"></textarea>
		</div>

		{#if uStatus === 'waiting_for_client'}
			<div class="form__field">
				<label class="form__label" for="timeline-required-action">Required from client</label>
				<textarea
					id="timeline-required-action"
					class="form__input form__textarea"
					class:form__input--error={updateFieldErrors.requiredAction}
					bind:value={uRequiredAction}
					disabled={savingUpdate}
					rows="2"
					placeholder="e.g. Please provide your company logo"
					required></textarea>
				<p class="form__hint">Shown to the client so they know why progress is paused.</p>
				{#if updateFieldErrors.requiredAction}
					<p class="form__error">{updateFieldErrors.requiredAction}</p>
				{/if}
			</div>
		{/if}
	</form>

	{#snippet footer()}
		<button
			class="btn btn--secondary"
			type="button"
			onclick={closeUpdateModal}
			disabled={savingUpdate}
		>
			Cancel
		</button>
		<button class="btn btn--brand" type="submit" form="timeline-form" disabled={savingUpdate}>
			{#if savingUpdate}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Saving…</span>
			{:else}
				<i class="ri-check-line" aria-hidden="true"></i>
				<span>{updateMode === 'create' ? 'Add update' : 'Save changes'}</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Delete timeline update -->
<Modal open={deleteOpen} title="Delete update" onclose={closeDelete}>
	<div class="confirm">
		{#if deleteError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{deleteError}</span>
			</div>
		{/if}
		<p class="confirm__text">
			Delete <strong>{deleteTarget?.title}</strong>? This removes the entry from the project
			timeline and can't be undone.
		</p>
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
				<span>Delete</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<style lang="scss">
	.page {
		&__back {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			margin-bottom: 20px;
			font-size: 14px;
			color: var(--text-body);
			text-decoration: none;

			&:hover {
				color: var(--text-heading);
			}

			i {
				font-size: 18px;
			}
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

	.card {
		background-color: var(--neutral-primary-soft);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);
	}

	.header-card {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 24px;
		margin-bottom: 28px;

		&__top {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 16px;
		}

		&__title {
			display: flex;
			align-items: center;
			gap: 14px;
		}

		&__index {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			width: 44px;
			height: 44px;
			font-size: 18px;
			font-weight: 700;
			color: var(--fg-brand-strong);
			background-color: var(--brand-soft);
			border-radius: var(--radius-full);
		}

		&__name {
			margin: 0 0 8px;
			font-size: 20px;
			font-weight: 600;
			line-height: 1.25;
			color: var(--text-heading);
		}

		&__badges {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 8px;
		}

		.client-hint {
			display: inline-flex;
			align-items: center;
			gap: 4px;
			font-size: 12px;
			font-weight: 500;
			color: var(--text-body-subtle);
			cursor: default;

			i {
				font-size: 14px;
			}
		}

		&__progress {
			display: flex;
			flex-direction: column;
			gap: 6px;
		}

		&__overall {
			display: flex;
			flex-direction: column;
			gap: 6px;
			margin-top: -8px;
		}

		&__progress-label {
			font-size: 12px;
			color: var(--text-body-subtle);
		}

		&__facts {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
			gap: 16px;
			margin: 0;
			padding-top: 4px;
			border-top: 1px solid var(--border-default);
		}
	}

	.fact {
		display: flex;
		flex-direction: column;
		gap: 4px;

		&--wide {
			grid-column: 1 / -1;
		}

		&__label {
			font-size: 12px;
			color: var(--text-body-subtle);
		}

		&__value {
			margin: 0;
			font-size: 14px;
			line-height: 1.5;
			color: var(--text-heading);
		}
	}

	.scope-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 12px 14px;
		background-color: var(--warning-soft);
		border: 1px solid var(--warning-medium);
		border-radius: var(--radius-base);

		&--locked {
			background-color: var(--success-soft);
			border-color: var(--border-success);
		}

		&__text {
			display: flex;
			align-items: flex-start;
			gap: 10px;
			min-width: 0;
		}

		&__icon {
			flex-shrink: 0;
			margin-top: 1px;
			font-size: 18px;
			color: var(--warning-strong);
		}

		&--locked &__icon {
			color: var(--fg-success);
		}

		&__desc {
			margin: 0;
			font-size: 13px;
			line-height: 1.45;
			color: var(--text-body);
		}
	}

	.timeline-section {
		display: flex;
		flex-direction: column;
		gap: 12px;

		&__head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
		}

		&__heading {
			margin: 0;
			font-size: 16px;
			font-weight: 600;
			color: var(--text-heading);
		}

		&__lock {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			font-size: 13px;
			font-weight: 500;
			color: var(--fg-success);

			i {
				font-size: 16px;
			}
		}
	}

	.timeline {
		padding: 20px;

		&__empty {
			margin: 0;
			font-size: 14px;
			color: var(--text-body-subtle);
			text-align: center;
		}

		&__list {
			display: flex;
			flex-direction: column;
			gap: 16px;
			margin: 0;
			padding: 0;
			list-style: none;
		}

		&__item {
			position: relative;
			display: flex;
			gap: 14px;

			&:not(:last-child)::before {
				content: '';
				position: absolute;
				top: 16px;
				left: 4px;
				width: 2px;
				height: calc(100% + 4px);
				background-color: var(--border-default-medium);
			}
		}

		&__marker {
			position: relative;
			z-index: 1;
			flex-shrink: 0;
			width: 10px;
			height: 10px;
			margin-top: 5px;
			background-color: var(--brand);
			border-radius: var(--radius-full);
			box-shadow: 0 0 0 3px var(--neutral-primary-soft);
		}

		&__body {
			flex: 1;
			min-width: 0;
		}

		&__row {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 4px;
		}

		&__date {
			font-size: 12px;
			font-weight: 500;
			color: var(--text-body);
		}

		&__actions {
			display: flex;
			gap: 4px;
			margin-left: auto;
		}

		&__title {
			margin: 0;
			font-size: 14px;
			font-weight: 600;
			color: var(--text-heading);
		}

		&__desc {
			margin: 4px 0 0;
			font-size: 13px;
			line-height: 1.5;
			color: var(--text-body);
		}

		&__action-required {
			display: flex;
			gap: 8px;
			margin-top: 8px;
			padding: 10px 12px;
			background-color: var(--danger-soft);
			border: 1px solid var(--border-danger);
			border-radius: var(--radius-base);

			i {
				flex-shrink: 0;
				margin-top: 1px;
				font-size: 16px;
				color: var(--fg-danger);
			}
		}

		&__action-label {
			display: block;
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--fg-danger);
		}

		&__action-text {
			margin: 2px 0 0;
			font-size: 13px;
			line-height: 1.45;
			color: var(--text-heading);
		}
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		color: var(--text-body);
		background-color: var(--neutral-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		cursor: pointer;
		transition: all 200ms;

		i {
			font-size: 16px;
		}

		&:hover:not(:disabled) {
			background-color: var(--neutral-secondary-medium);
			color: var(--text-heading);
		}

		&:disabled {
			opacity: 0.4;
			cursor: not-allowed;
		}

		&--sm {
			width: 28px;
			height: 28px;

			i {
				font-size: 14px;
			}
		}

		&--danger {
			&:hover:not(:disabled) {
				color: var(--fg-danger);
				background-color: var(--danger-soft);
				border-color: var(--border-danger);
			}
		}
	}

	.progress {
		display: flex;
		align-items: center;
		gap: 10px;

		&__track {
			flex: 1;
			height: 8px;
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

		&--muted &__bar {
			background-color: var(--text-body-subtle);
		}

		&__value {
			min-width: 40px;
			font-size: 12px;
			font-variant-numeric: tabular-nums;
			text-align: right;
			color: var(--text-body);
		}
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;

		&__row {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 16px;
		}

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

		&__textarea {
			resize: vertical;
			line-height: 1.5;
		}

		&__error {
			margin: 6px 0 0;
			font-size: 12px;
			color: var(--fg-danger);
		}

		&__hint {
			margin: 6px 0 0;
			font-size: 12px;
			color: var(--text-body-subtle);
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

		&__note {
			display: flex;
			align-items: flex-start;
			gap: 8px;
			padding: 10px 12px;
			font-size: 13px;
			line-height: 1.45;
			color: var(--text-body);
			background-color: var(--success-soft);
			border: 1px solid var(--border-success);
			border-radius: var(--radius-base);

			i {
				flex-shrink: 0;
				margin-top: 1px;
				font-size: 16px;
				color: var(--fg-success);
			}
		}
	}

	// bits-ui Select — Trigger is in-flow, Content is portalled → global styles.
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
		border: 1px solid transparent;
		border-radius: var(--radius-base);
		cursor: pointer;
		text-decoration: none;
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

		&__spinner {
			width: 16px;
			height: 16px;
			border: 2px solid var(--color-1-400);
			border-top-color: currentColor;
			border-radius: var(--radius-full);
			animation: cj-spin 700ms linear infinite;
		}
	}

	.confirm {
		display: flex;
		flex-direction: column;
		gap: 16px;

		&__text {
			margin: 0;
			font-size: 14px;
			line-height: 1.5;
			color: var(--text-body);
		}
	}

	@media (max-width: 640px) {
		.form__row {
			grid-template-columns: 1fr;
		}

		.header-card__top {
			flex-direction: column;
		}
	}
</style>
