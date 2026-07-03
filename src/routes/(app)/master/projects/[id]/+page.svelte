<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Select } from 'bits-ui';
	import Modal from '$lib/components/Modal.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { createQuery, query, mutate } from '$lib/data/cache.svelte';
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
		public_slug: string | null;
		is_public: boolean;
		created_at: string;
		updated_at: string;
		progress: number;
		milestones: Milestone[];
	};

	// Shape held in the 'projects' list cache — kept in sync on edits so the list
	// reflects changes without a refetch.
	type ProjectListItem = {
		id: string;
		name: string;
		client_name: string;
		status: ProjectStatus;
		progress: number;
		created_at: string;
	};

	// Pure CSR + SWR. Keyed by id so navigating between projects picks the right
	// cache entry; the key getter is reactive, so switching route params swaps
	// the active resource and revalidates automatically. The milestone detail page
	// shares this exact cache entry (same key), so drilling in is instant.
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

	type ClientOption = { id: string; full_name: string; status: 'active' | 'inactive' };

	// Shares the same cache entry as the Clients page (get-or-create by key). Used
	// to populate the reassign-client picker in the Edit project modal.
	const clientsQ = query<ClientOption[]>('clients', async () => {
		const res = await fetch('/api/clients');
		if (!res.ok) throw new Error('Could not load clients.');
		const body = await res.json();
		return body.clients as ClientOption[];
	});

	const projectStatusMeta: Record<ProjectStatus, { label: string; className: string }> = {
		planning: { label: 'Planning', className: 'badge--gray' },
		in_progress: { label: 'In progress', className: 'badge--progress' },
		waiting_for_client: { label: 'Waiting for client', className: 'badge--waiting' },
		under_review: { label: 'Under review', className: 'badge--review' },
		completed: { label: 'Completed', className: 'badge--success' }
	};

	const milestoneStatusMeta: Record<MilestoneStatus, { label: string; className: string }> = {
		not_started: { label: 'Not started', className: 'badge--gray' },
		open: { label: 'Open', className: 'badge--open' },
		in_progress: { label: 'In progress', className: 'badge--progress' },
		completed: { label: 'Completed', className: 'badge--success' }
	};

	function formatDate(iso: string | null): string {
		if (!iso) return '—';
		// Date-only string; build a local date to avoid UTC off-by-one shifts.
		const [y, m, d] = iso.split('-').map(Number);
		if (!y || !m || !d) return '—';
		return new Date(y, m - 1, d).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Patch the shared list cache so the Projects table stays consistent.
	function syncListCache(project: ProjectDetail) {
		mutate<ProjectListItem[]>('projects', (cur) =>
			(cur ?? []).map((p) =>
				p.id === project.id
					? {
							...p,
							name: project.name,
							client_name: project.client_name,
							status: project.status,
							progress: project.progress
						}
					: p
			)
		);
	}

	// --- Edit project modal ---
	let editProjectOpen = $state(false);
	let savingProject = $state(false);
	let projectError = $state('');
	let projectFieldErrors = $state<{ name?: string; clientId?: string; publicSlug?: string }>({});
	let pName = $state('');
	let pClientId = $state('');
	let pDelivery = $state<string | null>(null);
	let pFocusTitle = $state('');
	let pFocusGoal = $state('');
	let pSlug = $state('');
	let pIsPublic = $state(false);

	// --- Public sharing (slug + availability + copy) ---
	const RESERVED_SLUGS = ['master', 'api', 'p', 'journey'];
	const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
	type SlugStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';
	let slugStatus = $state<SlugStatus>('idle');
	let slugCheckTimer: ReturnType<typeof setTimeout> | null = null;
	let copied = $state(false);

	// The full shareable URL, shown as a preview and used by the copy button.
	const shareUrl = $derived(pSlug ? `${page.url.origin}/p/${pSlug}` : '');

	// Locally validate the slug format (matches the DB + API rules) before we bother
	// the server with an availability check.
	function slugFormatValid(s: string): boolean {
		return s.length >= 3 && s.length <= 40 && SLUG_RE.test(s) && !RESERVED_SLUGS.includes(s);
	}

	// Normalise as the admin types, then debounce a live availability check.
	function onSlugInput(raw: string) {
		const s = raw.trim().toLowerCase();
		pSlug = s;
		copied = false;
		if (slugCheckTimer) clearTimeout(slugCheckTimer);

		if (s === '') {
			slugStatus = 'idle';
			return;
		}
		if (!slugFormatValid(s)) {
			slugStatus = 'invalid';
			return;
		}

		slugStatus = 'checking';
		slugCheckTimer = setTimeout(async () => {
			const target = s;
			try {
				const res = await fetch(
					`/api/projects/${page.params.id}/slug-available?slug=${encodeURIComponent(target)}`
				);
				const body = await res.json().catch(() => ({}));
				// Ignore stale responses if the admin kept typing.
				if (pSlug !== target) return;
				if (!res.ok) {
					slugStatus = 'idle';
					return;
				}
				slugStatus = body.valid && body.available ? 'available' : 'taken';
			} catch {
				if (pSlug === target) slugStatus = 'idle';
			}
		}, 400);
	}

	async function copyShareUrl() {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			copied = false;
		}
	}

	// Active clients, plus the currently-assigned client even if it's inactive, so
	// the picker always shows the current assignment and never renders blank.
	const clientItems = $derived.by(() => {
		const list = clientsQ.data ?? [];
		const items = list
			.filter((c) => c.status === 'active')
			.map((c) => ({ value: c.id, label: c.full_name }));
		if (pClientId && !items.some((i) => i.value === pClientId)) {
			const current = list.find((c) => c.id === pClientId);
			if (current) items.unshift({ value: current.id, label: current.full_name });
		}
		return items;
	});
	const selectedClientLabel = $derived(
		clientItems.find((c) => c.value === pClientId)?.label ?? projectQ.data?.client_name ?? ''
	);

	function openEditProject() {
		const project = projectQ.data;
		if (!project) return;
		pName = project.name;
		pClientId = project.client_id;
		pDelivery = project.expected_delivery_date;
		pFocusTitle = project.current_focus_title ?? '';
		pFocusGoal = project.current_focus_goal ?? '';
		pSlug = project.public_slug ?? '';
		pIsPublic = project.is_public;
		slugStatus = 'idle';
		copied = false;
		if (slugCheckTimer) clearTimeout(slugCheckTimer);
		projectError = '';
		projectFieldErrors = {};
		editProjectOpen = true;
		// Make sure the client picker has options to show.
		clientsQ.load();
	}

	function closeEditProject() {
		if (savingProject) return;
		editProjectOpen = false;
	}

	async function submitEditProject(event: SubmitEvent) {
		event.preventDefault();
		if (savingProject) return;
		savingProject = true;
		projectError = '';
		projectFieldErrors = {};

		try {
			const res = await fetch(`/api/projects/${page.params.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: pName,
					clientId: pClientId,
					expectedDeliveryDate: pDelivery,
					currentFocusTitle: pFocusTitle,
					currentFocusGoal: pFocusGoal,
					publicSlug: pSlug,
					isPublic: pIsPublic
				})
			});
			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				projectFieldErrors = {
					name: payload.errors?.name?.[0],
					clientId: payload.errors?.clientId?.[0],
					publicSlug: payload.errors?.publicSlug?.[0]
				};
				projectError = payload.message ?? 'Something went wrong. Please try again.';
				savingProject = false;
				return;
			}

			const cur = projectQ.data;
			if (cur) {
				// Reflect a client reassignment: pull the new client's name from the cache.
				const newClientName =
					clientItems.find((c) => c.value === payload.project.client_id)?.label ?? cur.client_name;
				const next: ProjectDetail = {
					...cur,
					name: payload.project.name,
					client_id: payload.project.client_id,
					client_name: newClientName,
					// status is auto-derived from milestones; the PATCH response doesn't
					// recompute it, so keep the value already on the card.
					status: cur.status,
					expected_delivery_date: payload.project.expected_delivery_date,
					current_focus_title: payload.project.current_focus_title,
					current_focus_goal: payload.project.current_focus_goal,
					public_slug: payload.project.public_slug,
					is_public: payload.project.is_public,
					updated_at: payload.project.updated_at
				};
				projectQ.set(() => next);
				syncListCache(next);
			}
			editProjectOpen = false;
			savingProject = false;
		} catch {
			projectError = 'Could not reach the server. Please try again.';
			savingProject = false;
		}
	}

	// --- Reorder (up/down) ---
	let movingId = $state<string | null>(null);
	let reorderError = $state('');

	async function move(m: Milestone, direction: 'up' | 'down') {
		if (movingId) return;
		const project = projectQ.data;
		if (!project) return;

		const ordered = [...project.milestones].sort((a, b) => a.position - b.position);
		const i = ordered.findIndex((x) => x.id === m.id);
		const j = direction === 'up' ? i - 1 : i + 1;
		if (i < 0 || j < 0 || j >= ordered.length) return;

		const a = ordered[i];
		const b = ordered[j];
		movingId = m.id;
		reorderError = '';

		try {
			// Swap the two milestones' position values.
			const [resA, resB] = await Promise.all([
				fetch(`/api/milestones/${a.id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ position: b.position })
				}),
				fetch(`/api/milestones/${b.id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ position: a.position })
				})
			]);

			if (!resA.ok || !resB.ok) {
				reorderError = 'Could not reorder milestones. Refreshing…';
				await projectQ.load();
				return;
			}

			const cur = projectQ.data;
			if (cur) {
				const milestones = cur.milestones.map((x) => {
					if (x.id === a.id) return { ...x, position: b.position };
					if (x.id === b.id) return { ...x, position: a.position };
					return x;
				});
				projectQ.set(() => ({ ...cur, milestones }));
			}
		} catch {
			reorderError = 'Could not reach the server. Refreshing…';
			await projectQ.load();
		} finally {
			movingId = null;
		}
	}

	// --- Add milestone modal ---
	let addMilestoneOpen = $state(false);
	let addingMilestone = $state(false);
	let addMilestoneError = $state('');
	let addMilestoneFieldErrors = $state<{ name?: string }>({});
	let amName = $state('');
	let amStart = $state<string | null>(null);
	let amCompletion = $state<string | null>(null);
	let amOverview = $state('');

	function openAddMilestone() {
		amName = '';
		amStart = null;
		amCompletion = null;
		amOverview = '';
		addMilestoneError = '';
		addMilestoneFieldErrors = {};
		addMilestoneOpen = true;
	}

	function closeAddMilestone() {
		if (addingMilestone) return;
		addMilestoneOpen = false;
	}

	async function submitAddMilestone(event: SubmitEvent) {
		event.preventDefault();
		if (addingMilestone) return;
		addingMilestone = true;
		addMilestoneError = '';
		addMilestoneFieldErrors = {};

		try {
			const res = await fetch('/api/milestones', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					projectId: page.params.id,
					name: amName,
					startDate: amStart,
					expectedCompletionDate: amCompletion,
					overview: amOverview
				})
			});
			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				addMilestoneFieldErrors = { name: payload.errors?.name?.[0] };
				addMilestoneError = payload.message ?? 'Something went wrong. Please try again.';
				addingMilestone = false;
				return;
			}

			// The API returns the milestone row without its (empty) timeline list.
			const created: Milestone = {
				...(payload.milestone as Omit<Milestone, 'timeline_updates'>),
				timeline_updates: []
			};
			const cur = projectQ.data;
			if (cur) {
				const milestones = [...cur.milestones, created];
				const next: ProjectDetail = {
					...cur,
					milestones,
					progress: computeOverallProgress(milestones)
				};
				projectQ.set(() => next);
				syncListCache(next);
			}
			addMilestoneOpen = false;
			addingMilestone = false;
		} catch {
			addMilestoneError = 'Could not reach the server. Please try again.';
			addingMilestone = false;
		}
	}

	// --- Delete milestone (confirm modal) ---
	let deleteMilestoneTarget = $state<Milestone | null>(null);
	let deletingMilestone = $state(false);
	let deleteMilestoneError = $state('');

	const deleteMilestoneOpen = $derived(deleteMilestoneTarget !== null);

	function askDeleteMilestone(m: Milestone) {
		deleteMilestoneTarget = m;
		deleteMilestoneError = '';
	}

	function closeDeleteMilestone() {
		if (deletingMilestone) return;
		deleteMilestoneTarget = null;
	}

	async function confirmDeleteMilestone() {
		if (deletingMilestone || !deleteMilestoneTarget) return;
		const target = deleteMilestoneTarget;
		deletingMilestone = true;
		deleteMilestoneError = '';

		try {
			const res = await fetch(`/api/milestones/${target.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				deleteMilestoneError = body.message ?? 'Could not delete the milestone. Please try again.';
				deletingMilestone = false;
				return;
			}

			const cur = projectQ.data;
			if (cur) {
				const milestones = cur.milestones.filter((m) => m.id !== target.id);
				const next: ProjectDetail = {
					...cur,
					milestones,
					progress: computeOverallProgress(milestones)
				};
				projectQ.set(() => next);
				syncListCache(next);
			}
			deleteMilestoneTarget = null;
			deletingMilestone = false;
		} catch {
			deleteMilestoneError = 'Could not reach the server. Please try again.';
			deletingMilestone = false;
		}
	}

	const orderedMilestones = $derived(
		[...(projectQ.data?.milestones ?? [])].sort((a, b) => a.position - b.position)
	);

	// --- Weights: each milestone's % share of the project total. Must sum to 100. ---
	// The saved data can drift off 100 (adding/deleting a milestone leaves it un-set),
	// so we surface a soft nudge; the overall % keeps working meanwhile because the
	// progress math normalises. Only the editor hard-enforces the 100 rule.
	const savedWeightTotal = $derived(orderedMilestones.reduce((sum, m) => sum + (m.weight ?? 0), 0));
	const weightsBalanced = $derived(orderedMilestones.length === 0 || savedWeightTotal === 100);

	let weightsOpen = $state(false);
	let savingWeights = $state(false);
	let weightsError = $state('');
	// Editable draft: one entry per milestone. Weight is a number, or null while the
	// input is cleared mid-edit (so it doesn't snap to 0).
	let weightDraft = $state<{ id: string; name: string; weight: number | null }[]>([]);

	const weightDraftTotal = $derived(
		weightDraft.reduce((sum, w) => sum + (typeof w.weight === 'number' ? w.weight : 0), 0)
	);
	const weightDraftValid = $derived(
		weightDraft.length > 0 &&
			weightDraftTotal === 100 &&
			weightDraft.every(
				(w) =>
					typeof w.weight === 'number' &&
					Number.isInteger(w.weight) &&
					w.weight >= 0 &&
					w.weight <= 100
			)
	);

	function openWeights() {
		const project = projectQ.data;
		if (!project) return;
		weightDraft = orderedMilestones.map((m) => ({
			id: m.id,
			name: m.name,
			weight: m.weight ?? 0
		}));
		weightsError = '';
		weightsOpen = true;
	}

	function closeWeights() {
		if (savingWeights) return;
		weightsOpen = false;
	}

	// Split 100 as evenly as possible, handing the remainder to the first milestones
	// so the total always lands on exactly 100.
	function distributeEvenly() {
		const n = weightDraft.length;
		if (n === 0) return;
		const base = Math.floor(100 / n);
		const remainder = 100 - base * n;
		weightDraft = weightDraft.map((w, i) => ({ ...w, weight: base + (i < remainder ? 1 : 0) }));
	}

	async function submitWeights() {
		if (savingWeights || !weightDraftValid) return;
		savingWeights = true;
		weightsError = '';

		try {
			const res = await fetch(`/api/projects/${page.params.id}/weights`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					weights: weightDraft.map((w) => ({ id: w.id, weight: w.weight ?? 0 }))
				})
			});
			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				weightsError = payload.message ?? 'Could not save the weights. Please try again.';
				savingWeights = false;
				return;
			}

			const cur = projectQ.data;
			if (cur) {
				const applied = new Map<string, number>(
					(payload.weights as { id: string; weight: number }[]).map((w) => [w.id, w.weight])
				);
				const milestones = cur.milestones.map((m) =>
					applied.has(m.id) ? { ...m, weight: applied.get(m.id)! } : m
				);
				const next: ProjectDetail = {
					...cur,
					milestones,
					progress: computeOverallProgress(milestones)
				};
				projectQ.set(() => next);
				syncListCache(next);
			}
			weightsOpen = false;
			savingWeights = false;
		} catch {
			weightsError = 'Could not reach the server. Please try again.';
			savingWeights = false;
		}
	}

	const skeletonRows = [0, 1, 2, 3, 4];
</script>

<svelte:head>
	<title>{projectQ.data?.name ?? 'Project'}</title>
</svelte:head>

<section class="page">
	<a class="page__back" href={resolve('/master/projects')}>
		<i class="ri-arrow-left-line" aria-hidden="true"></i>
		<span>Projects</span>
	</a>

	{#if projectQ.error}
		<div class="page__empty">
			<i class="ri-error-warning-line page__empty-icon" aria-hidden="true"></i>
			<p class="page__empty-text">{projectQ.error}</p>
			<button class="btn btn--secondary" type="button" onclick={() => projectQ.load()}>
				Try again
			</button>
		</div>
	{:else if projectQ.data === undefined}
		<div class="card header-card">
			<Skeleton width="240px" height="28px" />
			<Skeleton width="180px" />
			<Skeleton width="100%" height="8px" radius="var(--radius-full)" />
		</div>
		<div class="milestones__grid">
			{#each skeletonRows as row (row)}
				<div class="card mcard">
					<Skeleton width="120px" height="20px" />
					<Skeleton width="100%" height="8px" radius="var(--radius-full)" />
				</div>
			{/each}
		</div>
	{:else}
		{@const project = projectQ.data}
		<header class="header-card card">
			<div class="header-card__top">
				<div>
					<h1 class="header-card__name">{project.name}</h1>
					<p class="header-card__meta">
						<i class="ri-user-3-line" aria-hidden="true"></i>
						<span>{project.client_name}</span>
						<span class="badge {projectStatusMeta[project.status].className}">
							{projectStatusMeta[project.status].label}
						</span>
					</p>
				</div>
				<button class="btn btn--secondary" type="button" onclick={openEditProject}>
					<i class="ri-edit-line" aria-hidden="true"></i>
					<span>Edit project</span>
				</button>
			</div>

			<div class="header-card__progress">
				<div class="progress">
					<div class="progress__track">
						<div class="progress__bar" style="width: {project.progress}%"></div>
					</div>
					<span class="progress__value">{project.progress}%</span>
				</div>
				<span class="header-card__progress-label">Overall progress</span>
			</div>

			<dl class="header-card__facts">
				<div class="fact">
					<dt class="fact__label">Expected delivery</dt>
					<dd class="fact__value">{formatDate(project.expected_delivery_date)}</dd>
				</div>
				{#if project.current_focus_title}
					<div class="fact">
						<dt class="fact__label">Current focus</dt>
						<dd class="fact__value">{project.current_focus_title}</dd>
					</div>
				{/if}
				{#if project.current_focus_goal}
					<div class="fact fact--wide">
						<dt class="fact__label">Today's goal</dt>
						<dd class="fact__value">{project.current_focus_goal}</dd>
					</div>
				{/if}
			</dl>
		</header>

		<section class="milestones" aria-label="Milestones">
			<div class="milestones__head">
				<h2 class="milestones__heading">Milestones</h2>
				<div class="milestones__actions">
					{#if orderedMilestones.length > 0}
						<button class="btn btn--secondary btn--sm" type="button" onclick={openWeights}>
							<i class="ri-scales-3-line" aria-hidden="true"></i>
							<span>Adjust weights</span>
						</button>
					{/if}
					<button class="btn btn--secondary btn--sm" type="button" onclick={openAddMilestone}>
						<i class="ri-add-line" aria-hidden="true"></i>
						<span>Add milestone</span>
					</button>
				</div>
			</div>

			{#if orderedMilestones.length > 0 && !weightsBalanced}
				<button class="weights-nudge" type="button" onclick={openWeights}>
					<i class="ri-scales-3-line" aria-hidden="true"></i>
					<span>
						Milestone weights total <strong>{savedWeightTotal}%</strong>, not 100%. The overall
						progress still works, but adjust them so each milestone's share is exact.
					</span>
					<span class="weights-nudge__cta">Adjust</span>
				</button>
			{/if}

			{#if reorderError}
				<div class="form__alert" role="alert">
					<i class="ri-error-warning-line" aria-hidden="true"></i>
					<span>{reorderError}</span>
				</div>
			{/if}

			{#if orderedMilestones.length === 0}
				<p class="milestones__empty">No milestones yet. Add the first phase of this project.</p>
			{:else}
				<div class="milestones__grid">
					{#each orderedMilestones as m, index (m.id)}
						<article class="card mcard">
							<!-- Stretched link makes the whole card open the milestone; action
							     buttons below sit above it (z-index) so they stay clickable. -->
							<a
								class="mcard__link"
								href={resolve(`/master/projects/${page.params.id}/milestones/${m.id}`)}
								aria-label="Open {m.name}"
							></a>

							<div class="mcard__top">
								<span class="mcard__index">{index + 1}</span>
								<span class="mcard__badges">
									{#if !m.scope_finalized}
										<span class="badge badge--gray">
											<i class="ri-draft-line" aria-hidden="true"></i>
											Draft
										</span>
									{/if}
									<span class="badge {milestoneStatusMeta[m.status].className}">
										{milestoneStatusMeta[m.status].label}
									</span>
								</span>
							</div>

							<h3 class="mcard__name">{m.name}</h3>

							<div class="progress">
								<div class="progress__track">
									<div class="progress__bar" style="width: {m.progress}%"></div>
								</div>
								<span class="progress__value">{m.progress}%</span>
							</div>

							<div class="mcard__foot">
								<span class="mcard__updates">
									<i class="ri-list-check-2" aria-hidden="true"></i>
									{m.timeline_updates.length}
									{m.timeline_updates.length === 1 ? 'update' : 'updates'}
								</span>
								<div class="mcard__actions">
									<button
										class="icon-btn icon-btn--sm"
										type="button"
										onclick={() => move(m, 'up')}
										disabled={index === 0 || movingId !== null}
										aria-label="Move {m.name} up"
									>
										<i class="ri-arrow-up-line" aria-hidden="true"></i>
									</button>
									<button
										class="icon-btn icon-btn--sm"
										type="button"
										onclick={() => move(m, 'down')}
										disabled={index === orderedMilestones.length - 1 || movingId !== null}
										aria-label="Move {m.name} down"
									>
										<i class="ri-arrow-down-line" aria-hidden="true"></i>
									</button>
									<button
										class="icon-btn icon-btn--sm icon-btn--danger"
										type="button"
										onclick={() => askDeleteMilestone(m)}
										aria-label="Delete {m.name}"
									>
										<i class="ri-delete-bin-line" aria-hidden="true"></i>
									</button>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</section>

<!-- Edit project -->
<Modal open={editProjectOpen} title="Edit project" onclose={closeEditProject}>
	<form id="edit-project-form" class="form" onsubmit={submitEditProject} novalidate>
		{#if projectError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{projectError}</span>
			</div>
		{/if}

		<div class="form__field">
			<label class="form__label" for="edit-project-name">Project name</label>
			<input
				id="edit-project-name"
				class="form__input"
				class:form__input--error={projectFieldErrors.name}
				type="text"
				bind:value={pName}
				disabled={savingProject}
				required
			/>
			{#if projectFieldErrors.name}
				<p class="form__error">{projectFieldErrors.name}</p>
			{/if}
		</div>

		<div class="form__field">
			<span class="form__label" id="edit-project-client-label">Assigned client</span>
			<Select.Root
				type="single"
				value={pClientId}
				onValueChange={(v) => (pClientId = v)}
				items={clientItems}
				disabled={savingProject}
			>
				<Select.Trigger class="select__trigger" aria-labelledby="edit-project-client-label">
					<span>{selectedClientLabel}</span>
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
			{#if projectFieldErrors.clientId}
				<p class="form__error">{projectFieldErrors.clientId}</p>
			{/if}
		</div>

		<div class="form__field">
			<label class="form__label" for="edit-project-delivery">Expected delivery date</label>
			<DatePicker
				id="edit-project-delivery"
				value={pDelivery}
				onChange={(v) => (pDelivery = v)}
				disabled={savingProject}
				ariaLabel="Expected delivery date"
			/>
		</div>

		<div class="form__field">
			<label class="form__label" for="edit-project-focus-title">Current focus</label>
			<input
				id="edit-project-focus-title"
				class="form__input"
				type="text"
				bind:value={pFocusTitle}
				disabled={savingProject}
				placeholder="e.g. Finalising the homepage design"
			/>
		</div>

		<div class="form__field">
			<label class="form__label" for="edit-project-focus-goal">Today's goal</label>
			<textarea
				id="edit-project-focus-goal"
				class="form__input form__textarea"
				bind:value={pFocusGoal}
				disabled={savingProject}
				rows="2"
				placeholder="What the client should expect next"></textarea>
		</div>

		<!-- Public sharing: a login-less, read-only view of this journey. -->
		<div class="share">
			<span class="form__label">Public sharing</span>
			<p class="share__lead">
				Share a read-only version of this journey with anyone — no login needed.
			</p>

			<label class="toggle">
				<input
					type="checkbox"
					class="toggle__input"
					bind:checked={pIsPublic}
					disabled={savingProject}
				/>
				<span class="toggle__track" aria-hidden="true"><span class="toggle__thumb"></span></span>
				<span class="toggle__text">{pIsPublic ? 'Public view is on' : 'Public view is off'}</span>
			</label>

			<div class="form__field share__field">
				<label class="form__label" for="edit-project-slug">Public link</label>
				<div class="share__row">
					<span class="share__prefix">/p/</span>
					<input
						id="edit-project-slug"
						class="form__input share__input"
						class:form__input--error={projectFieldErrors.publicSlug ||
							slugStatus === 'invalid' ||
							slugStatus === 'taken'}
						type="text"
						value={pSlug}
						oninput={(e) => onSlugInput(e.currentTarget.value)}
						disabled={savingProject}
						placeholder="acme-website"
						autocomplete="off"
						spellcheck="false"
					/>
				</div>

				{#if slugStatus === 'invalid'}
					<p class="form__error">Use 3–40 lowercase letters, numbers and hyphens.</p>
				{:else if slugStatus === 'checking'}
					<p class="share__status share__status--muted">
						<span class="share__spinner" aria-hidden="true"></span> Checking availability…
					</p>
				{:else if slugStatus === 'available'}
					<p class="share__status share__status--ok">
						<i class="ri-check-line" aria-hidden="true"></i> This link is available.
					</p>
				{:else if slugStatus === 'taken'}
					<p class="form__error">That link is already taken. Try another.</p>
				{/if}
				{#if projectFieldErrors.publicSlug}
					<p class="form__error">{projectFieldErrors.publicSlug}</p>
				{/if}

				{#if pSlug && slugStatus !== 'invalid'}
					<div class="share__preview">
						<span class="share__url" title={shareUrl}>{shareUrl}</span>
						<button
							type="button"
							class="btn btn--secondary btn--sm share__copy"
							onclick={copyShareUrl}
							disabled={savingProject}
						>
							{#if copied}
								<i class="ri-check-line" aria-hidden="true"></i>
								<span>Copied</span>
							{:else}
								<i class="ri-file-copy-line" aria-hidden="true"></i>
								<span>Copy</span>
							{/if}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</form>

	{#snippet footer()}
		<button
			class="btn btn--secondary"
			type="button"
			onclick={closeEditProject}
			disabled={savingProject}
		>
			Cancel
		</button>
		<button class="btn btn--brand" type="submit" form="edit-project-form" disabled={savingProject}>
			{#if savingProject}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Saving…</span>
			{:else}
				<i class="ri-check-line" aria-hidden="true"></i>
				<span>Save changes</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Add milestone -->
<Modal open={addMilestoneOpen} title="Add milestone" onclose={closeAddMilestone}>
	<form id="add-milestone-form" class="form" onsubmit={submitAddMilestone} novalidate>
		{#if addMilestoneError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{addMilestoneError}</span>
			</div>
		{/if}

		<div class="form__field">
			<label class="form__label" for="add-milestone-name">Name</label>
			<input
				id="add-milestone-name"
				class="form__input"
				class:form__input--error={addMilestoneFieldErrors.name}
				type="text"
				bind:value={amName}
				disabled={addingMilestone}
				required
			/>
			{#if addMilestoneFieldErrors.name}
				<p class="form__error">{addMilestoneFieldErrors.name}</p>
			{/if}
		</div>

		<div class="form__row">
			<div class="form__field">
				<label class="form__label" for="add-milestone-start">Start date</label>
				<DatePicker
					id="add-milestone-start"
					value={amStart}
					onChange={(v) => (amStart = v)}
					disabled={addingMilestone}
					ariaLabel="Milestone start date"
				/>
			</div>
			<div class="form__field">
				<label class="form__label" for="add-milestone-completion">Expected completion</label>
				<DatePicker
					id="add-milestone-completion"
					value={amCompletion}
					onChange={(v) => (amCompletion = v)}
					disabled={addingMilestone}
					ariaLabel="Milestone expected completion date"
				/>
			</div>
		</div>

		<div class="form__field">
			<label class="form__label" for="add-milestone-overview">Overview</label>
			<textarea
				id="add-milestone-overview"
				class="form__input form__textarea"
				bind:value={amOverview}
				disabled={addingMilestone}
				rows="3"
				placeholder="What happens in this phase"></textarea>
		</div>
	</form>

	{#snippet footer()}
		<button
			class="btn btn--secondary"
			type="button"
			onclick={closeAddMilestone}
			disabled={addingMilestone}
		>
			Cancel
		</button>
		<button
			class="btn btn--brand"
			type="submit"
			form="add-milestone-form"
			disabled={addingMilestone}
		>
			{#if addingMilestone}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Adding…</span>
			{:else}
				<i class="ri-add-line" aria-hidden="true"></i>
				<span>Add milestone</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Delete milestone -->
<Modal open={deleteMilestoneOpen} title="Delete milestone" onclose={closeDeleteMilestone}>
	<div class="confirm">
		{#if deleteMilestoneError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{deleteMilestoneError}</span>
			</div>
		{/if}
		<p class="confirm__text">
			Delete <strong>{deleteMilestoneTarget?.name}</strong>? This removes the milestone and all of
			its timeline updates, and can't be undone.
		</p>
	</div>

	{#snippet footer()}
		<button
			class="btn btn--secondary"
			type="button"
			onclick={closeDeleteMilestone}
			disabled={deletingMilestone}
		>
			Cancel
		</button>
		<button
			class="btn btn--danger"
			type="button"
			onclick={confirmDeleteMilestone}
			disabled={deletingMilestone}
		>
			{#if deletingMilestone}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Deleting…</span>
			{:else}
				<i class="ri-delete-bin-line" aria-hidden="true"></i>
				<span>Delete milestone</span>
			{/if}
		</button>
	{/snippet}
</Modal>

<!-- Adjust weights -->
<Modal open={weightsOpen} title="Adjust milestone weights" onclose={closeWeights}>
	<div class="weights">
		<p class="weights__lead">
			Each milestone's share of the project. The numbers must add up to <strong>100%</strong>.
		</p>

		{#if weightsError}
			<div class="form__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{weightsError}</span>
			</div>
		{/if}

		<div class="weights__list">
			{#each weightDraft as row, i (row.id)}
				<div class="weights__row">
					<span class="weights__name">{row.name}</span>
					<div class="weights__input-wrap">
						<input
							class="form__input weights__input"
							type="number"
							min="0"
							max="100"
							step="1"
							inputmode="numeric"
							bind:value={weightDraft[i].weight}
							disabled={savingWeights}
							aria-label="Weight for {row.name}"
						/>
						<span class="weights__pct">%</span>
					</div>
				</div>
			{/each}
		</div>

		<div
			class="weights__total"
			class:weights__total--ok={weightDraftValid}
			class:weights__total--off={!weightDraftValid}
		>
			<span class="weights__total-label">Total</span>
			<span class="weights__total-value">
				{weightDraftTotal}%
				{#if weightDraftValid}
					<i class="ri-checkbox-circle-fill" aria-hidden="true"></i>
				{:else if weightDraftTotal < 100}
					<span class="weights__total-hint">· {100 - weightDraftTotal}% left</span>
				{:else}
					<span class="weights__total-hint">· {weightDraftTotal - 100}% over</span>
				{/if}
			</span>
		</div>
	</div>

	{#snippet footer()}
		<button
			class="btn btn--secondary btn--sm weights__even"
			type="button"
			onclick={distributeEvenly}
			disabled={savingWeights}
		>
			<i class="ri-equalizer-line" aria-hidden="true"></i>
			<span>Distribute evenly</span>
		</button>
		<button
			class="btn btn--secondary"
			type="button"
			onclick={closeWeights}
			disabled={savingWeights}
		>
			Cancel
		</button>
		<button
			class="btn btn--brand"
			type="button"
			onclick={submitWeights}
			disabled={savingWeights || !weightDraftValid}
		>
			{#if savingWeights}
				<span class="btn__spinner" aria-hidden="true"></span>
				<span>Saving…</span>
			{:else}
				<i class="ri-check-line" aria-hidden="true"></i>
				<span>Save weights</span>
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

		&__name {
			margin: 0 0 8px;
			font-size: 20px;
			font-weight: 600;
			line-height: 1.25;
			color: var(--text-heading);
		}

		&__meta {
			display: flex;
			align-items: center;
			gap: 8px;
			margin: 0;
			font-size: 14px;
			color: var(--text-body);

			i {
				font-size: 16px;
			}
		}

		&__progress {
			display: flex;
			flex-direction: column;
			gap: 6px;
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
			color: var(--text-heading);
		}
	}

	.milestones {
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

		&__actions {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		&__empty {
			margin: 0;
			padding: 24px;
			font-size: 14px;
			color: var(--text-body);
			text-align: center;
			background-color: var(--neutral-primary-soft);
			border: 1px dashed var(--border-default-strong);
			border-radius: var(--radius-base);
		}

		&__grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
			gap: 16px;
		}
	}

	.mcard {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 20px;
		transition:
			border-color 200ms,
			box-shadow 200ms,
			transform 200ms;

		&:hover {
			border-color: var(--border-brand);
			box-shadow: var(--shadow-md);
			transform: translateY(-2px);
		}

		// Stretched link overlay — covers the whole card so a click anywhere opens
		// the milestone. Action buttons opt out by sitting above it (z-index).
		&__link {
			position: absolute;
			inset: 0;
			z-index: 0;
			border-radius: var(--radius-base);

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 2px var(--brand);
			}
		}

		&__top {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
		}

		&__index {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			font-size: 16px;
			font-weight: 700;
			color: var(--brand-strong);
			background-color: var(--brand-softer);
			border-radius: var(--radius-full);
		}

		&__badges {
			display: flex;
			flex-wrap: wrap;
			justify-content: flex-end;
			gap: 6px;
		}

		&__name {
			margin: 0;
			font-size: 16px;
			font-weight: 600;
			line-height: 1.3;
			color: var(--text-heading);
		}

		&__foot {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			margin-top: auto;
			padding-top: 4px;
		}

		&__updates {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			font-size: 12px;
			color: var(--text-body-subtle);

			i {
				font-size: 14px;
			}
		}

		// Actions sit above the stretched link so they stay independently clickable.
		&__actions {
			position: relative;
			z-index: 1;
			display: flex;
			align-items: center;
			gap: 6px;
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
	.share {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 16px;
		border-top: 1px solid var(--border-default);

		&__lead {
			margin: -4px 0 0;
			font-size: 13px;
			line-height: 1.5;
			color: var(--text-body-subtle);
		}

		&__field {
			margin-top: 4px;
		}

		&__row {
			display: flex;
			align-items: stretch;
		}

		&__prefix {
			display: inline-flex;
			align-items: center;
			padding: 0 10px;
			font-size: 14px;
			color: var(--text-body-subtle);
			background-color: var(--neutral-tertiary-medium);
			border: 1px solid var(--border-default-medium);
			border-right: none;
			border-radius: var(--radius-base) 0 0 var(--radius-base);
		}

		&__input {
			border-radius: 0 var(--radius-base) var(--radius-base) 0;
		}

		&__status {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			margin: 6px 0 0;
			font-size: 12px;

			i {
				font-size: 14px;
			}

			&--muted {
				color: var(--text-body-subtle);
			}

			&--ok {
				color: var(--fg-success);
			}
		}

		&__spinner {
			width: 12px;
			height: 12px;
			border: 2px solid var(--border-default-strong);
			border-top-color: var(--text-body);
			border-radius: var(--radius-full);
			animation: cj-spin 700ms linear infinite;
		}

		&__preview {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-top: 10px;
			padding: 8px 8px 8px 12px;
			background-color: var(--neutral-secondary-medium);
			border: 1px solid var(--border-default);
			border-radius: var(--radius-base);
		}

		&__url {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: 13px;
			color: var(--text-body);
		}

		&__copy {
			flex-shrink: 0;
		}
	}

	// Accessible toggle switch: a native checkbox rendered as a switch.
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		user-select: none;

		&__input {
			position: absolute;
			width: 1px;
			height: 1px;
			opacity: 0;
			pointer-events: none;
		}

		&__track {
			position: relative;
			flex-shrink: 0;
			width: 40px;
			height: 22px;
			background-color: var(--neutral-tertiary-medium);
			border: 1px solid var(--border-default-medium);
			border-radius: var(--radius-full);
			transition: background-color 200ms;
		}

		&__thumb {
			position: absolute;
			top: 2px;
			left: 2px;
			width: 16px;
			height: 16px;
			background-color: var(--neutral-primary);
			border-radius: var(--radius-full);
			box-shadow: var(--shadow-xs);
			transition: transform 200ms;
		}

		&__input:checked + &__track {
			background-color: var(--brand);
			border-color: var(--brand);

			.toggle__thumb {
				transform: translateX(18px);
				background-color: var(--text-white);
			}
		}

		&__input:focus-visible + &__track {
			box-shadow: 0 0 0 3px var(--brand-medium);
		}

		&__input:disabled + &__track {
			opacity: 0.6;
		}

		&__text {
			font-size: 14px;
			color: var(--text-heading);
		}
	}

	// Soft banner shown when saved weights don't total 100%.
	.weights-nudge {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 12px 14px;
		font-family: inherit;
		font-size: 13px;
		line-height: 1.4;
		text-align: left;
		color: var(--text-body);
		background-color: var(--warning-soft, var(--neutral-secondary-medium));
		border: 1px solid var(--border-warning, var(--border-default-medium));
		border-radius: var(--radius-base);
		cursor: pointer;
		transition: background-color 200ms;

		i {
			flex-shrink: 0;
			font-size: 18px;
			color: var(--fg-warning, var(--text-body));
		}

		strong {
			color: var(--text-heading);
		}

		&:hover {
			background-color: var(--neutral-tertiary-medium);
		}

		&__cta {
			flex-shrink: 0;
			margin-left: auto;
			font-weight: 600;
			color: var(--fg-brand);
		}
	}

	.weights {
		display: flex;
		flex-direction: column;
		gap: 16px;

		&__lead {
			margin: 0;
			font-size: 14px;
			line-height: 1.5;
			color: var(--text-body);

			strong {
				color: var(--text-heading);
			}
		}

		&__list {
			display: flex;
			flex-direction: column;
			gap: 10px;
		}

		&__row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
		}

		&__name {
			flex: 1;
			min-width: 0;
			font-size: 14px;
			color: var(--text-heading);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&__input-wrap {
			position: relative;
			flex-shrink: 0;
			width: 96px;
		}

		&__input {
			width: 100%;
			padding-right: 28px;
			text-align: right;
			font-variant-numeric: tabular-nums;
		}

		&__pct {
			position: absolute;
			top: 50%;
			right: 12px;
			transform: translateY(-50%);
			font-size: 13px;
			color: var(--text-body-subtle);
			pointer-events: none;
		}

		&__total {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			padding: 12px 14px;
			border-radius: var(--radius-base);
			border: 1px solid var(--border-default);
			background-color: var(--neutral-secondary-medium);

			&--ok {
				color: var(--fg-success);
				border-color: var(--border-success, var(--fg-success));
				background-color: var(--success-soft, var(--neutral-secondary-medium));
			}

			&--off {
				color: var(--text-body);
			}
		}

		&__total-label {
			font-size: 14px;
			font-weight: 500;
		}

		&__total-value {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			font-size: 15px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;

			i {
				font-size: 18px;
			}
		}

		&__total-hint {
			font-weight: 500;
			color: var(--text-body-subtle);
		}

		&__even {
			margin-right: auto;
		}
	}
</style>
