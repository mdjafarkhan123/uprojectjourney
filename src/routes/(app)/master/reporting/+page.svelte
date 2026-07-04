<script lang="ts">
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { query } from '$lib/data/cache.svelte';

	// One recorded VISIT (a whole stay — entry to exit), joined + duration-derived by
	// GET /api/reporting. Newest first. Two kinds:
	//   - 'portal': a logged-in client's stay in their portal (has client_name).
	//   - 'public': an anonymous visit to a shared link (has project_name, no client).
	type Visit = {
		id: string;
		source: 'portal' | 'public';
		client_id: string | null;
		client_name: string | null;
		project_name: string | null;
		started_at: string;
		last_seen_at: string;
		duration_seconds: number;
	};

	// Pure CSR (shell stays SSR): fetch + stale-while-revalidate cache. The API caps
	// to the last 90 days; the range toggle below filters those rows client-side.
	const reportingQ = query<Visit[]>('reporting', async () => {
		const res = await fetch('/api/reporting');
		if (!res.ok) throw new Error('Could not load reporting data.');
		const body = await res.json();
		return body.views as Visit[];
	});

	// --- Range filter (over already-fetched rows) ---
	const ranges = [
		{ days: 7, label: '7 days' },
		{ days: 30, label: '30 days' },
		{ days: 90, label: '90 days' }
	];
	let rangeDays = $state(30);

	const filtered = $derived.by(() => {
		const rows = reportingQ.data ?? [];
		const since = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
		return rows.filter((v) => new Date(v.started_at).getTime() >= since);
	});

	// Split the two surfaces once — portal (logged-in clients) vs public (shared links).
	const portalVisits = $derived(filtered.filter((v) => v.source === 'portal'));
	const publicVisits = $derived(filtered.filter((v) => v.source === 'public'));

	// --- Summary tiles ---
	const totalVisits = $derived(filtered.length);
	const totalSeconds = $derived(filtered.reduce((sum, v) => sum + v.duration_seconds, 0));
	const portalCount = $derived(portalVisits.length);
	const publicCount = $derived(publicVisits.length);

	// --- Per-client rollup (portal only — public visits have no client) ---
	type ClientRollup = {
		client_id: string;
		client_name: string;
		visits: number;
		seconds: number;
		lastVisit: string;
	};

	const perClient = $derived.by<ClientRollup[]>(() => {
		// Transient scratch map for the rollup — not reactive state (a plain Map is
		// correct here; reactivity lives in the $derived it returns).
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map<string, ClientRollup>();
		for (const v of portalVisits) {
			if (!v.client_id) continue;
			const existing = map.get(v.client_id);
			if (existing) {
				existing.visits += 1;
				existing.seconds += v.duration_seconds;
				if (v.started_at > existing.lastVisit) existing.lastVisit = v.started_at;
			} else {
				map.set(v.client_id, {
					client_id: v.client_id,
					client_name: v.client_name ?? '—',
					visits: 1,
					seconds: v.duration_seconds,
					lastVisit: v.started_at
				});
			}
		}
		return [...map.values()].sort((a, b) => b.visits - a.visits);
	});

	// --- Per-project rollup for PUBLIC shared links (which links get traffic) ---
	type PublicLinkRollup = {
		name: string;
		visits: number;
		seconds: number;
		lastVisit: string;
	};

	const perPublicLink = $derived.by<PublicLinkRollup[]>(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map<string, PublicLinkRollup>();
		for (const v of publicVisits) {
			const name = v.project_name ?? '—';
			const existing = map.get(name);
			if (existing) {
				existing.visits += 1;
				existing.seconds += v.duration_seconds;
				if (v.started_at > existing.lastVisit) existing.lastVisit = v.started_at;
			} else {
				map.set(name, { name, visits: 1, seconds: v.duration_seconds, lastVisit: v.started_at });
			}
		}
		return [...map.values()].sort((a, b) => b.visits - a.visits);
	});

	// --- Views-over-time series (one bucket per day across the whole range) ---
	function localDayKey(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	type DayBucket = { key: string; label: string; count: number };

	const daySeries = $derived.by<DayBucket[]>(() => {
		// Scratch counters + date cursors below are transient, not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const counts = new Map<string, number>();
		for (const v of filtered) {
			const key = localDayKey(new Date(v.started_at));
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		// Build a continuous day axis so quiet days show as zero, not as gaps.
		const buckets: DayBucket[] = [];
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		for (let i = rangeDays - 1; i >= 0; i--) {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const d = new Date(today);
			d.setDate(today.getDate() - i);
			const key = localDayKey(d);
			buckets.push({
				key,
				label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
				count: counts.get(key) ?? 0
			});
		}
		return buckets;
	});

	const maxDayCount = $derived(Math.max(1, ...daySeries.map((b) => b.count)));

	// SVG area-chart geometry (single brand-hue series → no legend needed).
	const CHART_W = 720;
	const CHART_H = 240;
	const PAD = { top: 16, right: 12, bottom: 28, left: 28 };
	const innerW = CHART_W - PAD.left - PAD.right;
	const innerH = CHART_H - PAD.top - PAD.bottom;

	function pointX(i: number, n: number): number {
		if (n <= 1) return PAD.left + innerW / 2;
		return PAD.left + (i / (n - 1)) * innerW;
	}
	function pointY(count: number): number {
		return PAD.top + innerH - (count / maxDayCount) * innerH;
	}

	const linePath = $derived.by(() => {
		const n = daySeries.length;
		if (n === 0) return '';
		return daySeries
			.map(
				(b, i) => `${i === 0 ? 'M' : 'L'} ${pointX(i, n).toFixed(1)} ${pointY(b.count).toFixed(1)}`
			)
			.join(' ');
	});
	const areaPath = $derived.by(() => {
		const n = daySeries.length;
		if (n === 0) return '';
		const baseline = PAD.top + innerH;
		const first = pointX(0, n);
		const last = pointX(n - 1, n);
		return `${linePath} L ${last.toFixed(1)} ${baseline} L ${first.toFixed(1)} ${baseline} Z`;
	});

	// X-axis ticks: first / middle / last only, to avoid crowding.
	const xTicks = $derived.by(() => {
		const n = daySeries.length;
		if (n === 0) return [];
		const idxs = n === 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
		return [...new Set(idxs)].map((i) => ({
			x: pointX(i, n),
			label: daySeries[i].label
		}));
	});

	// Only draw per-point dots when the axis is sparse enough to read them.
	const showDots = $derived(daySeries.length <= 31);

	// Per-client bar chart (single-series magnitude) — top 8, widths vs the busiest.
	const clientBars = $derived.by(() => {
		const top = perClient.slice(0, 8);
		const max = Math.max(1, ...top.map((c) => c.visits));
		return top.map((c) => ({ ...c, pct: Math.round((c.visits / max) * 100) }));
	});

	// Recent visits (rows already arrive newest-first from the API).
	const recentVisits = $derived(filtered.slice(0, 20));

	// --- Formatting ---
	function formatDuration(sec: number): string {
		if (sec < 60) return `${sec}s`;
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
		const h = Math.floor(m / 60);
		const mm = m % 60;
		return mm ? `${h}h ${mm}m` : `${h}h`;
	}

	function formatDateTime(iso: string): string {
		return new Date(iso).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	const skeletonRows = [0, 1, 2, 3, 4];
</script>

<svelte:head>
	<title>Reporting</title>
</svelte:head>

<section class="page">
	<header class="page__header">
		<div>
			<h1 class="page__heading">Reporting</h1>
			<p class="page__subheading">
				How often your clients visit their portal and shared links, and how long they stay.
			</p>
		</div>
		<div class="range" role="group" aria-label="Date range">
			{#each ranges as r (r.days)}
				<button
					type="button"
					class="range__btn"
					class:range__btn--active={rangeDays === r.days}
					aria-pressed={rangeDays === r.days}
					onclick={() => (rangeDays = r.days)}
				>
					{r.label}
				</button>
			{/each}
		</div>
	</header>

	{#if reportingQ.error}
		<div class="page__empty">
			<i class="ri-error-warning-line page__empty-icon" aria-hidden="true"></i>
			<p class="page__empty-text">{reportingQ.error}</p>
			<button class="btn btn--secondary" type="button" onclick={() => reportingQ.load()}>
				Try again
			</button>
		</div>
	{:else if reportingQ.data === undefined}
		<!-- Loading skeleton -->
		<div class="stats">
			{#each skeletonRows.slice(0, 4) as tile (tile)}
				<div class="stat">
					<Skeleton width="80px" height="12px" />
					<Skeleton width="64px" height="28px" />
				</div>
			{/each}
		</div>
		<div class="panel">
			<Skeleton width="100%" height="240px" radius="var(--radius-base)" />
		</div>
	{:else if (reportingQ.data ?? []).length === 0}
		<div class="page__empty">
			<i class="ri-bar-chart-2-line page__empty-icon" aria-hidden="true"></i>
			<p class="page__empty-text">
				No visits recorded yet. Once a client opens their portal or someone opens a shared link,
				their activity shows up here.
			</p>
		</div>
	{:else}
		<!-- Summary tiles -->
		<div class="stats">
			<div class="stat">
				<span class="stat__label">Total visits</span>
				<span class="stat__value">{totalVisits}</span>
			</div>
			<div class="stat">
				<span class="stat__label">Total time viewed</span>
				<span class="stat__value">{formatDuration(totalSeconds)}</span>
			</div>
			<div class="stat">
				<span class="stat__label">Portal visits</span>
				<span class="stat__value">{portalCount}</span>
			</div>
			<div class="stat">
				<span class="stat__label">Public link visits</span>
				<span class="stat__value">{publicCount}</span>
			</div>
		</div>

		{#if totalVisits === 0}
			<div class="page__empty">
				<i class="ri-calendar-line page__empty-icon" aria-hidden="true"></i>
				<p class="page__empty-text">No visits in the last {rangeDays} days. Try a wider range.</p>
			</div>
		{:else}
			<!-- Visits over time -->
			<div class="panel">
				<h2 class="panel__title">Visits over time</h2>
				<svg
					class="chart"
					viewBox="0 0 {CHART_W} {CHART_H}"
					preserveAspectRatio="none"
					role="img"
					aria-label="Visits per day over the last {rangeDays} days"
				>
					<!-- Horizontal gridlines at 0 / mid / max -->
					{#each [0, 0.5, 1] as frac (frac)}
						{@const y = PAD.top + innerH - frac * innerH}
						<line class="chart__grid" x1={PAD.left} y1={y} x2={CHART_W - PAD.right} y2={y} />
						<text class="chart__ylabel" x={PAD.left - 6} y={y + 3} text-anchor="end">
							{Math.round(frac * maxDayCount)}
						</text>
					{/each}

					<path class="chart__area" d={areaPath} />
					<path class="chart__line" d={linePath} />

					{#if showDots}
						{#each daySeries as b, i (b.key)}
							<circle
								class="chart__dot"
								cx={pointX(i, daySeries.length)}
								cy={pointY(b.count)}
								r="3"
							>
								<title>{b.label}: {b.count} {b.count === 1 ? 'visit' : 'visits'}</title>
							</circle>
						{/each}
					{/if}

					{#each xTicks as tick (tick.label)}
						<text class="chart__xlabel" x={tick.x} y={CHART_H - 8} text-anchor="middle">
							{tick.label}
						</text>
					{/each}
				</svg>
			</div>

			{#if portalCount > 0}
				<div class="grid">
					<!-- Visits per client (portal) -->
					<div class="panel">
						<h2 class="panel__title">Visits per client</h2>
						<ul class="bars">
							{#each clientBars as c (c.client_id)}
								<li class="bars__row">
									<span class="bars__label" title={c.client_name}>{c.client_name}</span>
									<div class="bars__track">
										<div class="bars__fill" style="width: {c.pct}%"></div>
									</div>
									<span class="bars__value">{c.visits}</span>
								</li>
							{/each}
						</ul>
					</div>

					<!-- Per-client summary table (portal) -->
					<div class="panel">
						<h2 class="panel__title">Client activity</h2>
						<div class="table-wrap">
							<table class="table">
								<thead>
									<tr>
										<th scope="col">Client</th>
										<th scope="col">Visits</th>
										<th scope="col">Total time</th>
										<th scope="col">Last visit</th>
									</tr>
								</thead>
								<tbody>
									{#each perClient as c (c.client_id)}
										<tr>
											<th scope="row" class="table__row-header">{c.client_name}</th>
											<td>{c.visits}</td>
											<td>{formatDuration(c.seconds)}</td>
											<td>{formatDate(c.lastVisit)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}

			{#if publicCount > 0}
				<!-- Public shared-link activity (anonymous visitors, per project) -->
				<div class="panel">
					<h2 class="panel__title">Public link activity</h2>
					<div class="table-wrap">
						<table class="table">
							<thead>
								<tr>
									<th scope="col">Shared project</th>
									<th scope="col">Visits</th>
									<th scope="col">Total time</th>
									<th scope="col">Last visit</th>
								</tr>
							</thead>
							<tbody>
								{#each perPublicLink as p (p.name)}
									<tr>
										<th scope="row" class="table__row-header">{p.name}</th>
										<td>{p.visits}</td>
										<td>{formatDuration(p.seconds)}</td>
										<td>{formatDate(p.lastVisit)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			<!-- Recent visits -->
			<div class="panel">
				<h2 class="panel__title">Recent visits</h2>
				<div class="table-wrap">
					<table class="table">
						<thead>
							<tr>
								<th scope="col">Viewer</th>
								<th scope="col">Entered</th>
								<th scope="col">Left</th>
								<th scope="col">Duration</th>
							</tr>
						</thead>
						<tbody>
							{#each recentVisits as v (v.id)}
								<tr>
									<th scope="row" class="table__row-header">
										{#if v.source === 'public'}
											<span class="viewer">
												<span class="viewer__name">Public visitor</span>
												<span class="viewer__meta">
													<i class="ri-global-line" aria-hidden="true"></i>
													{v.project_name ?? 'Shared link'}
												</span>
											</span>
										{:else}
											{v.client_name ?? '—'}
										{/if}
									</th>
									<td>{formatDateTime(v.started_at)}</td>
									<td>{formatDateTime(v.last_seen_at)}</td>
									<td>{formatDuration(v.duration_seconds)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	{/if}
</section>

<style lang="scss">
	.page {
		&__header {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 16px;
			margin-bottom: 24px;
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
			max-width: 420px;
			font-size: 14px;
			color: var(--text-body);
		}
	}

	// Segmented range toggle.
	.range {
		display: inline-flex;
		flex-shrink: 0;
		padding: 3px;
		background-color: var(--neutral-secondary-medium);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);

		&__btn {
			padding: 6px 12px;
			font-family: inherit;
			font-size: 13px;
			font-weight: 500;
			color: var(--text-body);
			background-color: transparent;
			border: none;
			border-radius: var(--radius-sm);
			cursor: pointer;
			transition: all 150ms;

			&:hover {
				color: var(--text-heading);
			}

			&--active {
				color: var(--fg-brand-strong);
				background-color: var(--neutral-primary);
				box-shadow: var(--shadow-xs);
			}
		}
	}

	// Stat tiles.
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
		margin-bottom: 16px;

		@media (max-width: 720px) {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px 20px;
		background-color: var(--neutral-primary-soft);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);

		&__label {
			font-size: 13px;
			color: var(--text-body-subtle);
		}

		&__value {
			font-size: 26px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
			color: var(--text-heading);
		}
	}

	.panel {
		padding: 20px;
		margin-bottom: 16px;
		background-color: var(--neutral-primary-soft);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);

		&__title {
			margin: 0 0 16px;
			font-size: 15px;
			font-weight: 600;
			color: var(--text-heading);
		}
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;

		.panel {
			margin-bottom: 0;
		}

		@media (max-width: 900px) {
			grid-template-columns: 1fr;
		}
	}

	// SVG area chart (single brand-hue series).
	.chart {
		display: block;
		width: 100%;
		height: 240px;

		&__grid {
			stroke: var(--border-default);
			stroke-width: 1;
		}

		&__area {
			fill: var(--brand);
			fill-opacity: 0.12;
		}

		&__line {
			fill: none;
			stroke: var(--brand);
			stroke-width: 2;
			stroke-linejoin: round;
			stroke-linecap: round;
		}

		&__dot {
			fill: var(--neutral-primary-soft);
			stroke: var(--brand);
			stroke-width: 2;
		}

		&__ylabel,
		&__xlabel {
			font-size: 11px;
			fill: var(--text-body-subtle);
		}
	}

	// Horizontal bar list (views per client).
	.bars {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin: 0;
		padding: 0;
		list-style: none;

		&__row {
			display: grid;
			grid-template-columns: 120px 1fr 40px;
			align-items: center;
			gap: 12px;
		}

		&__label {
			overflow: hidden;
			font-size: 13px;
			color: var(--text-body);
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&__track {
			height: 10px;
			background-color: var(--neutral-tertiary-medium);
			border-radius: var(--radius-full);
			overflow: hidden;
		}

		&__fill {
			height: 100%;
			background-color: var(--brand);
			border-radius: var(--radius-full);
			transition: width 300ms ease;
		}

		&__value {
			font-size: 13px;
			font-variant-numeric: tabular-nums;
			font-weight: 500;
			color: var(--text-heading);
			text-align: right;
		}
	}

	.table-wrap {
		overflow-x: auto;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
		color: var(--text-body);
		text-align: left;

		thead th {
			padding: 8px 12px;
			font-weight: 500;
			color: var(--text-body-subtle);
			white-space: nowrap;
			border-bottom: 1px solid var(--border-default);
		}

		tbody tr:not(:last-child) {
			border-bottom: 1px solid var(--border-default);
		}

		tbody td {
			padding: 12px;
			vertical-align: middle;
			font-variant-numeric: tabular-nums;
		}

		&__row-header {
			padding: 12px;
			font-weight: 500;
			color: var(--text-heading);
			white-space: nowrap;
		}
	}

	// Viewer cell for public (anonymous) visits: name + a muted project sub-line.
	.viewer {
		display: flex;
		flex-direction: column;
		gap: 2px;

		&__name {
			font-weight: 500;
			color: var(--text-heading);
		}

		&__meta {
			display: inline-flex;
			align-items: center;
			gap: 4px;
			font-size: 12px;
			font-weight: 400;
			color: var(--text-body-subtle);

			i {
				font-size: 13px;
			}
		}
	}

	// Shared button (mirrors the other admin pages' self-contained .btn).
	:global(.btn) {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		font-family: inherit;
		font-size: 14px;
		font-weight: 500;
		border-radius: var(--radius-base);
		cursor: pointer;
		transition: all 200ms;
	}

	.btn--secondary {
		color: var(--text-heading);
		background-color: var(--neutral-secondary-medium);
		border: 1px solid var(--border-default-medium);

		&:hover {
			background-color: var(--neutral-tertiary-medium);
		}
	}
</style>
