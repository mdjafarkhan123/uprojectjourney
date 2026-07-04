<script lang="ts">
	import type { Milestone } from '$lib/portal/types';
	import {
		milestoneStatusLabel,
		timelineStatusMeta,
		timelineStatusIcon,
		formatDate,
		formatDateTime,
		formatStampDate,
		nodeState,
		visibleTimelineItems,
		NOT_STARTED_PREVIEW
	} from '$lib/portal/journey';

	// Presentational milestone detail (header + timeline). Shared by the logged-in
	// portal milestone page and the login-less public milestone page — each supplies
	// its own back-link / loading / not-found chrome around this. Read-only.
	//
	// Note: on the public view `required_action` arrives as null (stripped server-side),
	// so the "Required from you" callout simply never renders there.
	let { milestone, index }: { milestone: Milestone; index: number } = $props();

	// By default only the next few not-started items show (visibleTimelineItems), so the
	// phase reads as a focused journey. But hiding the rest silently can make the client
	// think the phase is nearly done — so when there ARE more, we surface the count and a
	// toggle to reveal every remaining step (and collapse back).
	let showAllUpcoming = $state(false);
	const notStartedCount = $derived(
		milestone.timeline_updates.filter((u) => u.status === 'not_started').length
	);
	const hiddenCount = $derived(Math.max(0, notStartedCount - NOT_STARTED_PREVIEW));
	const shownUpdates = $derived(
		showAllUpcoming ? milestone.timeline_updates : visibleTimelineItems(milestone.timeline_updates)
	);
</script>

<header class="card header header--{nodeState(milestone)}">
	<div class="header__top">
		<span class="header__index" aria-hidden="true">{index + 1}</span>
		<div class="header__titles">
			<h1 class="header__name">{milestone.name}</h1>
			<span class="badge badge--{nodeState(milestone)}">{milestoneStatusLabel(milestone)}</span>
		</div>
	</div>

	<div class="header__progress">
		<div class="progress">
			<div class="progress__track">
				<div class="progress__bar" style="width: {milestone.progress}%"></div>
			</div>
			<span class="progress__value">{milestone.progress}%</span>
		</div>
		<span class="header__progress-label">This phase</span>
	</div>

	<dl class="header__facts">
		<div class="fact">
			<dt class="fact__label">Start</dt>
			<dd class="fact__value">{formatDate(milestone.start_date)}</dd>
		</div>
		<div class="fact">
			<dt class="fact__label">Expected completion</dt>
			<dd class="fact__value">{formatDate(milestone.expected_completion_date)}</dd>
		</div>
		<div class="fact">
			<dt class="fact__label">Last updated</dt>
			<dd class="fact__value">{formatDateTime(milestone.updated_at)}</dd>
		</div>
		{#if milestone.overview}
			<div class="fact fact--wide">
				<dt class="fact__label">Overview</dt>
				<dd class="fact__value">{milestone.overview}</dd>
			</div>
		{/if}
	</dl>
</header>

<section class="timeline-section" aria-label="Timeline">
	<h2 class="timeline-section__heading">Timeline</h2>
	{#if milestone.timeline_updates.length === 0}
		<div class="card timeline-empty">
			<p class="timeline-empty__text">No updates for this phase yet.</p>
		</div>
	{:else}
		<!-- Client-facing slice: all completed/active items, but by default only the next few
		     not-started ones (see visibleTimelineItems) — expandable via the toggle below.
		     Updates arrive oldest-first, so the timeline reads as a story top-to-bottom. -->
		<ol class="tl">
			{#each shownUpdates as u (u.id)}
				<li class="tl__item tl__item--{u.status}">
					<div class="tl__rail">
						<span class="tl__node" aria-hidden="true">
							<i class={timelineStatusIcon[u.status]}></i>
						</span>
					</div>
					<div class="tl__card">
						<div class="tl__meta">
							<span class="badge {timelineStatusMeta[u.status].className}">
								{timelineStatusMeta[u.status].label}
							</span>
							<!-- Dates the client sees are real progress, never the internal entry/creation
							     date: "Started" once the item first moves off not-started, "Completed" when
							     done. A still-not-started item shows no date at all. -->
							{#if u.status !== 'not_started' && u.started_at}
								<span class="tl__date">
									<span class="tl__date-label">Started</span>
									{formatStampDate(u.started_at)}
								</span>
							{/if}
							{#if u.status === 'completed' && u.completed_at}
								<span class="tl__date">
									<span class="tl__date-label">Completed</span>
									{formatStampDate(u.completed_at)}
								</span>
							{/if}
						</div>
						<p class="tl__title">{u.title}</p>
						{#if u.description}
							<p class="tl__desc">{u.description}</p>
						{/if}
						{#if u.status === 'waiting_for_client' && u.required_action}
							<div class="tl__action" role="note">
								<i class="ri-alarm-warning-line" aria-hidden="true"></i>
								<div>
									<span class="tl__action-label">Required from you</span>
									<p class="tl__action-text">{u.required_action}</p>
								</div>
							</div>
						{/if}
					</div>
				</li>
			{/each}
		</ol>

		{#if hiddenCount > 0}
			<div class="tl-more">
				{#if !showAllUpcoming}
					<p class="tl-more__count">
						+{hiddenCount} more upcoming {hiddenCount === 1 ? 'step' : 'steps'}
					</p>
				{/if}
				<button
					type="button"
					class="tl-more__toggle"
					aria-expanded={showAllUpcoming}
					onclick={() => (showAllUpcoming = !showAllUpcoming)}
				>
					{showAllUpcoming ? 'Show less' : 'View all'}
					<i
						class={showAllUpcoming ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}
						aria-hidden="true"
					></i>
				</button>
			</div>
		{/if}
	{/if}
</section>

<style lang="scss">
	.header {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 24px;
		margin-bottom: 28px;

		&__top {
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
			color: var(--text-body-subtle);
			background-color: var(--neutral-secondary-medium);
			border-radius: var(--radius-full);
		}

		&--done &__index {
			color: var(--text-white);
			background-color: var(--success);
		}

		&--active &__index {
			color: var(--text-white);
			background-color: var(--brand);
		}

		&__name {
			margin: 0 0 8px;
			font-size: 20px;
			font-weight: 600;
			line-height: 1.25;
			color: var(--text-heading);
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
			line-height: 1.5;
			color: var(--text-heading);
		}
	}

	.timeline-section {
		display: flex;
		flex-direction: column;
		gap: 16px;

		&__heading {
			margin: 0;
			font-size: 16px;
			font-weight: 600;
			color: var(--text-heading);
		}
	}

	.timeline-empty {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 20px;

		&__text {
			margin: 0;
			font-size: 14px;
			color: var(--text-body-subtle);
			text-align: center;
		}
	}

	// --- "More upcoming" reveal: the count + toggle shown when a phase has more
	// not-started items than the default preview. Sits just under the timeline, indented
	// to line up with the cards (past the 40px rail column).
	.tl-more {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		margin-top: 4px;
		padding-left: 54px;

		&__count {
			margin: 0;
			font-size: 13px;
			font-weight: 500;
			color: var(--text-body-subtle);
		}

		&__toggle {
			display: inline-flex;
			align-items: center;
			gap: 4px;
			padding: 7px 14px;
			font-family: inherit;
			font-size: 13px;
			font-weight: 600;
			color: var(--fg-brand, var(--brand));
			background-color: var(--brand-softest, var(--neutral-secondary-medium));
			border: 1px solid var(--border-brand, var(--brand-medium));
			border-radius: var(--radius-full);
			cursor: pointer;
			transition:
				background-color 200ms,
				border-color 200ms;

			i {
				font-size: 16px;
			}

			&:hover {
				background-color: var(--brand-soft, var(--neutral-tertiary-medium));
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 3px var(--brand-medium);
			}
		}
	}

	@media (max-width: 640px) {
		.tl-more {
			padding-left: 46px;
		}
	}

	// --- Timeline: left rail = a soft status-icon node on a connector line; right =
	// a card whose meta row carries the date + our standard status badge. Node/card
	// colour follows status via the per-item token trio (`--tl-bg`/`--tl-fg`/`--tl-bd`).
	.tl {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;

		&__item {
			display: grid;
			grid-template-columns: 40px minmax(0, 1fr);
			column-gap: 14px;

			&--completed {
				--tl-bg: white;
				--tl-fg: var(--fg-success);
				--tl-bd: var(--border-success);
			}
			&--in_progress {
				--tl-bg: var(--badge-progress-bg);
				--tl-fg: var(--badge-progress-fg);
				--tl-bd: var(--badge-progress-bg);
			}
			&--waiting_for_client {
				--tl-bg: var(--danger-soft);
				--tl-fg: var(--fg-danger);
				--tl-bd: var(--border-danger);
			}
			&--under_review {
				--tl-bg: var(--warning-soft);
				--tl-fg: var(--warning-strong);
				--tl-bd: var(--warning-medium);
			}
			&--not_started {
				--tl-bg: var(--neutral-secondary-medium);
				--tl-fg: var(--text-body);
				--tl-bd: var(--border-default);

				// "Not started" reads as upcoming/locked: dim the whole row and drop the
				// node's emphasis ring until the admin moves it to an active status.
				opacity: 0.62;

				.tl__node {
					box-shadow: none;
				}
			}

			// Connector: from just below this node, across the gap, to the next node.
			&:not(:last-child) .tl__rail::after {
				content: '';
				position: absolute;
				top: 42px;
				bottom: -16px;
				left: 50%;
				width: 2px;
				transform: translateX(-50%);
				background-color: var(--border-default);
			}
		}

		&__rail {
			grid-column: 1;
			position: relative;
			align-self: stretch;
			display: flex;
			justify-content: center;
		}

		&__node {
			position: relative;
			z-index: 1;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			margin-top: 4px;
			width: 36px;
			height: 36px;
			color: var(--tl-fg);
			background-color: var(--tl-bg);
			border: 1px solid var(--tl-bd);
			border-radius: var(--radius-full);
			box-shadow: 0 0 0 4px var(--neutral-secondary-soft);

			i {
				font-size: 17px;
			}
		}

		// Status-based icon motion. Each active state gets a subtle, on-brand cue.
		// Disabled under prefers-reduced-motion (below).
		&__item--not_started &__node i {
			animation: tl-spin 9s linear infinite;
		}
		&__item--in_progress &__node i {
			animation: tl-spin 1.6s linear infinite;
		}
		&__item--waiting_for_client &__node i {
			animation: tl-pulse 1.5s ease-in-out infinite;
			transform-origin: center;
		}
		&__item--under_review &__node i {
			animation: tl-blink 2.6s ease-in-out infinite;
		}
		&__item--completed &__node i {
			animation: tl-pop 520ms ease-out both;
		}

		&__card {
			grid-column: 2;
			display: flex;
			flex-direction: column;
			margin-bottom: 16px;
			padding: 14px 16px;
			background-color: var(--neutral-primary-soft);
			border: 1px solid var(--tl-bd, var(--border-default));
			border-left: 5px solid var(--tl-fg, var(--border-default));
			border-radius: var(--radius-base);
			box-shadow: var(--shadow-xs);
		}

		&__meta {
			display: flex;
			align-items: center;
			flex-wrap: wrap;
			gap: 8px 10px;
			margin-bottom: 8px;
		}

		&__date {
			display: inline-flex;
			align-items: baseline;
			gap: 5px;
			font-size: 12px;
			font-weight: 500;
			font-variant-numeric: tabular-nums;
			color: var(--text-body-subtle);
		}

		// The "Started" / "Completed" prefix on a progress date — quiet, uppercase, so the
		// date itself stays the emphasis.
		&__date-label {
			font-size: 10px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--text-body-subtle);
			opacity: 0.85;
		}

		&__title {
			margin: 0;
			font-size: 15px;
			font-weight: 600;
			line-height: 1.35;
			color: var(--text-heading);
		}

		&__desc {
			margin: 6px 0 0;
			font-size: 13px;
			line-height: 1.55;
			color: var(--text-body);
		}

		&__action {
			display: flex;
			gap: 8px;
			margin-top: 12px;
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

	.progress {
		display: flex;
		align-items: center;
		gap: 10px;

		&__track {
			flex: 1;
			height: 10px;
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
			min-width: 44px;
			font-size: 13px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
			text-align: right;
			color: var(--text-heading);
		}
	}

	// --- Mobile (phones) ---
	@media (max-width: 640px) {
		.header {
			gap: 16px;
			padding: 18px 16px;
			margin-bottom: 22px;
		}

		.header__top {
			gap: 12px;
			align-items: flex-start;
		}

		.header__index {
			width: 38px;
			height: 38px;
			font-size: 16px;
		}

		.header__name {
			font-size: 18px;
		}

		.header__facts {
			grid-template-columns: 1fr;
			gap: 12px;
		}

		.timeline-section {
			gap: 12px;
		}

		.tl__item {
			grid-template-columns: 34px minmax(0, 1fr);
			column-gap: 12px;
		}

		.tl__node {
			width: 32px;
			height: 32px;

			i {
				font-size: 15px;
			}
		}

		.tl__item:not(:last-child) .tl__rail::after {
			top: 36px;
		}

		.tl__card {
			padding: 12px 14px;
		}

		.tl__meta {
			gap: 8px;
			margin-bottom: 6px;
		}
	}

	// --- Timeline icon animations ---
	@keyframes tl-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes tl-pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.18);
			opacity: 0.65;
		}
	}

	@keyframes tl-blink {
		0%,
		45%,
		100% {
			opacity: 1;
		}
		60%,
		80% {
			opacity: 0.35;
		}
	}

	@keyframes tl-pop {
		0% {
			transform: scale(0.4);
			opacity: 0;
		}
		70% {
			transform: scale(1.15);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	// Respect users who prefer less motion: keep the icons, drop the animation.
	@media (prefers-reduced-motion: reduce) {
		.tl__node i {
			animation: none !important;
		}
	}

	// --- Very small screens: keep the date + status on one comfortable row. ---
	@media (max-width: 380px) {
		.tl__item {
			grid-template-columns: 30px minmax(0, 1fr);
			column-gap: 10px;
		}

		.tl__node {
			width: 28px;
			height: 28px;
			box-shadow: 0 0 0 3px var(--neutral-secondary-soft);

			i {
				font-size: 14px;
			}
		}

		.tl__item:not(:last-child) .tl__rail::after {
			top: 32px;
		}
	}
</style>
