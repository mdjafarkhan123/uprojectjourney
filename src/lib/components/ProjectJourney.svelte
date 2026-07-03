<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Attachment } from 'svelte/attachments';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import type { PortalProject } from '$lib/portal/types';
	import {
		projectStatusMeta,
		formatDate,
		formatDateTime,
		formatRelative,
		nodeState,
		milestoneCaption,
		buildOverview,
		latestUpdate,
		deliveryCountdown
	} from '$lib/portal/journey';

	// `milestoneHref` lets the same journey drive both the logged-in portal
	// (default: `/milestones/[id]`) and the login-less public view
	// (`/p/[slug]/milestones/[id]`). Upcoming milestones stay non-clickable.
	let {
		project,
		milestoneHref
	}: { project: PortalProject; milestoneHref?: (id: string) => string } = $props();

	const linkFor = (id: string) =>
		milestoneHref ? milestoneHref(id) : resolve(`/milestones/${id}`);

	const overview = $derived(buildOverview(project));
	const latest = $derived(latestUpdate(project.milestones));
	const stepCount = $derived(project.milestones.length);
	const countdown = $derived(deliveryCountdown(project));

	// The journey (2nd) card. On mobile the overview can read as the whole page, so
	// the scroll nudge below taps this into view. The attachment just captures the
	// element so `scrollToJourney` can target it imperatively.
	let journeyCard: HTMLElement | undefined = $state();
	const captureJourney: Attachment<HTMLElement> = (node) => {
		journeyCard = node;
	};
	function scrollToJourney() {
		journeyCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// Reveal-on-scroll: fade + slide each milestone node up as it enters view, lightly
	// staggered so the row feels alive. Attachments run client-side only (never on the
	// server). No-ops — leaving the node fully visible — when the user prefers reduced
	// motion, when IntersectionObserver is missing, or when the node is already on
	// screen (so above-the-fold nodes never flash).
	function reveal(index: number): Attachment<HTMLElement> {
		return (node) => {
			const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
			const rect = node.getBoundingClientRect();
			const alreadyVisible = rect.top < window.innerHeight && rect.bottom > 0;
			if (reduceMotion || typeof IntersectionObserver === 'undefined' || alreadyVisible) {
				return;
			}

			node.classList.add('reveal');
			node.style.transitionDelay = `${Math.min(index, 6) * 80}ms`;
			const io = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							node.classList.add('reveal--in');
							io.unobserve(node);
						}
					}
				},
				{ threshold: 0.15 }
			);
			io.observe(node);
			return () => io.disconnect();
		};
	}
</script>

<div class="journey-wrap">
	<!-- Overview: the four at-a-glance questions. -->
	<div class="card overview">
		<div class="overview__head">
			<h1 class="overview__name">{project.name}</h1>
			<span class="badge {projectStatusMeta[project.status].className}">
				{projectStatusMeta[project.status].label}
			</span>
		</div>

		<div class="overview__progress">
			<div class="progress">
				<div class="progress__track">
					<div class="progress__bar" style="width: {project.progress}%"></div>
				</div>
				<span class="progress__value">{project.progress}%</span>
			</div>
			<span class="overview__progress-label">Overall progress</span>
		</div>

		{#if overview.waiting.length > 0}
			<div class="waiting" role="note">
				<i class="ri-alarm-warning-line waiting__icon" aria-hidden="true"></i>
				<div class="waiting__body">
					<span class="waiting__label">Waiting on you</span>
					<ul class="waiting__list">
						{#each overview.waiting as w (w.id)}
							<li class="waiting__item">
								<strong>{w.milestoneName}:</strong>
								{w.required_action}
							</li>
						{/each}
					</ul>
				</div>
			</div>
		{/if}

		<!-- Latest update, promoted out of the tile grid into an eye-catching brand
		     banner: it's the freshest signal, so it's the first thing a returning
		     client should notice. -->
		{#if latest}
			<div class="latest" role="note">
				<i class="ri-notification-badge-line latest__icon" aria-hidden="true"></i>
				<div class="latest__body">
					<span class="latest__label">Latest update</span>
					<span class="latest__title">{latest.title}</span>
				</div>
				<span class="latest__time" title={formatDate(latest.entry_date)}>
					{formatRelative(latest.entry_date)}
				</span>
			</div>
		{/if}

		<dl class="overview__grid">
			<div class="tile">
				<dt class="tile__label">
					<i class="ri-focus-3-line" aria-hidden="true"></i> Current focus
				</dt>
				<dd class="tile__value">
					{overview.currentFocusTitle}
					{#if overview.currentFocusGoal}
						<span class="tile__sub">{overview.currentFocusGoal}</span>
					{/if}
				</dd>
			</div>

			<div class="tile">
				<dt class="tile__label">
					<i class="ri-calendar-line" aria-hidden="true"></i> Started
				</dt>
				<dd class="tile__value">{formatDate(project.created_at.slice(0, 10))}</dd>
			</div>

			<div class="tile">
				<dt class="tile__label">
					<i class="ri-calendar-check-line" aria-hidden="true"></i> Expected delivery
				</dt>
				<dd class="tile__value">
					{formatDate(project.expected_delivery_date)}
					{#if countdown.hasDate}
						<span class="countdown countdown--{countdown.tone}">
							<i class="ri-timer-flash-line countdown__icon" aria-hidden="true"></i>
							{countdown.remainingLabel}
						</span>
						{#if countdown.totalLabel}
							<span class="tile__sub">of {countdown.totalLabel} total</span>
						{/if}
					{/if}
				</dd>
			</div>
		</dl>

		<!-- Mobile scroll cue: on a phone the overview can read as the whole page, so
		     this nudges the client down into the journey card (which only peeks below
		     the fold). Hidden on desktop, where both cards are visible at once. -->
		{#if stepCount > 0}
			<button type="button" class="scroll-nudge" onclick={scrollToJourney}>
				<span class="scroll-nudge__label">
					Follow your journey · {stepCount}
					{stepCount === 1 ? 'step' : 'steps'}
				</span>
				<i class="ri-arrow-down-line scroll-nudge__icon" aria-hidden="true"></i>
			</button>
		{/if}
	</div>

	<!-- The journey: milestones as a timeline. Horizontal on desktop,
	     vertical on mobile — same markup, restyled per breakpoint. -->
	<div class="card journey-card" {@attach captureJourney}>
		<h2 class="journey-card__heading">
			Project journey
			{#if stepCount > 0}
				<span class="journey-card__count">· {stepCount} {stepCount === 1 ? 'step' : 'steps'}</span>
			{/if}
		</h2>
		{#if project.milestones.length === 0}
			<p class="journey-card__empty">The journey for this project is being prepared.</p>
		{:else}
			<ol class="journey">
				{#each project.milestones as m, i (m.id)}
					{@const state = nodeState(m)}
					{@const isUpcoming = state === 'upcoming'}
					<li class="journey__node journey__node--{state}" {@attach reveal(i)}>
						<!-- Upcoming milestones aren't open yet, so they render as a plain,
						     non-clickable block (no link, no "View details"). -->
						<svelte:element
							this={isUpcoming ? 'div' : 'a'}
							class="journey__link"
							href={isUpcoming ? undefined : linkFor(m.id)}
							aria-disabled={isUpcoming ? 'true' : undefined}
						>
							<span class="journey__date">
								<!-- Freshness signal: when this phase last saw activity (any milestone or
								     work-item edit). Compact relative time so it never crowds the node on
								     mobile; the exact timestamp lives in the title tooltip. Blank for upcoming
								     phases that haven't started, so the slot stays aligned across the row. -->
								{#if !isUpcoming}
									<i class="ri-history-line" aria-hidden="true"></i>
									<span title="Updated {formatDateTime(m.updated_at)}"
										>Updated {formatRelative(m.updated_at)}</span
									>
								{/if}
							</span>
							<span class="journey__marker">
								{#if state === 'done'}
									<i class="ri-check-line" aria-hidden="true"></i>
								{:else}
									<ProgressRing value={m.progress} size={56} />
								{/if}
							</span>
							<span class="journey__name">{m.name}</span>
							<span class="badge badge--{state} journey__caption">{milestoneCaption(m)}</span>
							{#if !isUpcoming}
								<span class="journey__more">
									View details <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
								</span>
							{/if}
						</svelte:element>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</div>

<style lang="scss">
	.journey-wrap {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	// --- Overview ---
	.overview {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 24px;

		&__head {
			display: flex;
			align-items: center;
			gap: 12px;
			flex-wrap: wrap;
		}

		&__name {
			margin: 0;
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

		&__grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
			gap: 16px;
			margin: 0;
			padding-top: 4px;
			border-top: 1px solid var(--border-default);
		}
	}

	.tile {
		display: flex;
		flex-direction: column;
		gap: 6px;

		&__label {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			font-size: 12px;
			font-weight: 500;
			color: var(--text-body-subtle);

			i {
				font-size: 20px;
				line-height: 1;
			}
		}

		// Each tile gets its own accent so the row reads as colourful at a glance.
		&:nth-child(1) .tile__label i {
			color: var(--brand);
		}
		&:nth-child(2) .tile__label i {
			color: var(--info, #2563eb);
		}
		&:nth-child(3) .tile__label i {
			color: var(--success);
		}

		&__value {
			margin: 0;
			font-size: 14px;
			font-weight: 500;
			line-height: 1.4;
			color: var(--text-heading);
		}

		&__sub {
			display: block;
			margin-top: 2px;
			font-size: 13px;
			font-weight: 400;
			line-height: 1.45;
			color: var(--text-body);
		}
	}

	// Delivery countdown pill — the eye-catcher on the Expected delivery tile. Bold,
	// tabular, colour-coded by urgency; the two urgent tones (due today / overdue) add
	// a gentle pulse, silenced under reduced-motion.
	.countdown {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin-top: 6px;
		padding: 3px 10px;
		font-size: 13px;
		font-weight: 700;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
		border-radius: var(--radius-full);

		&__icon {
			font-size: 15px;
		}

		&--normal {
			color: var(--fg-success, #15803d);
			background-color: var(--success-soft, rgba(34, 197, 94, 0.14));
		}

		&--soon {
			color: var(--fg-warning, #b45309);
			background-color: var(--warning-soft, rgba(245, 158, 11, 0.16));
		}

		&--urgent {
			color: var(--fg-orange, #c2410c);
			background-color: var(--orange-soft, rgba(249, 115, 22, 0.16));
		}

		&--due {
			color: var(--fg-danger);
			background-color: var(--danger-soft);
			animation: countdown-pulse 1.8s ease-in-out infinite;
		}

		&--overdue {
			color: var(--fg-danger);
			background-color: var(--danger-soft);
			animation: countdown-pulse 1.8s ease-in-out infinite;
		}
	}

	@keyframes countdown-pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.05);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.countdown {
			animation: none;
		}
	}

	.waiting {
		display: flex;
		gap: 10px;
		padding: 12px 14px;
		background-color: var(--danger-soft);
		border: 1px solid var(--border-danger);
		border-radius: var(--radius-base);

		&__icon {
			flex-shrink: 0;
			margin-top: 1px;
			font-size: 18px;
			color: var(--fg-danger);
		}

		&__label {
			display: block;
			margin-bottom: 4px;
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--fg-danger);
		}

		&__list {
			margin: 0;
			padding-left: 16px;
		}

		&__item {
			font-size: 13px;
			line-height: 1.5;
			color: var(--text-heading);

			strong {
				font-weight: 600;
			}
		}
	}

	// --- Latest update banner (eye-catching, brand-accented) ---
	.latest {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 16px;
		background-color: var(--brand-softest, var(--neutral-primary-soft));
		border: 1px solid var(--border-brand, var(--brand-medium));
		border-left: 4px solid var(--brand);
		border-radius: var(--radius-base);

		&__icon {
			flex-shrink: 0;
			font-size: 28px;
			line-height: 1;
			color: var(--brand);
		}

		&__body {
			display: flex;
			flex-direction: column;
			gap: 2px;
			min-width: 0;
		}

		&__label {
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--fg-brand, var(--brand));
		}

		&__title {
			font-size: 15px;
			font-weight: 600;
			line-height: 1.35;
			color: var(--brand-strong);
		}

		&__time {
			flex-shrink: 0;
			margin-left: auto;
			font-size: 12px;
			font-weight: 500;
			white-space: nowrap;
			color: var(--text-body-subtle);
		}
	}

	// --- Mobile scroll cue (nudges the client into the journey card) ---
	// Mobile-first: shown here, hidden at the desktop breakpoint below where both
	// cards are already visible. A limited-count bounce catches the eye on load, then
	// rests so it never nags. Silenced entirely under reduced-motion.
	.scroll-nudge {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		margin-top: 4px;
		padding: 10px 14px;
		font-size: 13px;
		font-weight: 600;
		color: var(--fg-brand, var(--brand));
		background-color: var(--brand-softest, var(--neutral-primary-soft));
		border: 1px solid var(--border-brand, var(--brand-medium));
		border-radius: var(--radius-full);
		cursor: pointer;
		transition: background-color 200ms;

		&:hover {
			background-color: var(--brand-soft, var(--neutral-primary-soft));
		}

		&:focus-visible {
			outline: none;
			box-shadow: 0 0 0 3px var(--brand-medium);
		}

		&__icon {
			font-size: 18px;
			line-height: 1;
			animation: scroll-nudge-bounce 1.4s ease-in-out 4;
		}
	}

	@keyframes scroll-nudge-bounce {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(4px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.scroll-nudge__icon {
			animation: none;
		}
	}

	// --- Journey timeline (mobile-first = vertical) ---
	.journey-card {
		padding: 24px;

		&__heading {
			margin: 0 0 20px;
			font-size: 16px;
			font-weight: 600;
			color: var(--text-heading);
		}

		&__count {
			font-weight: 500;
			color: var(--text-body-subtle);
		}

		&__empty {
			margin: 0;
			font-size: 14px;
			color: var(--text-body-subtle);
		}
	}

	.journey {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.journey__node {
		position: relative;

		// Reveal-on-scroll: the `reveal` action hides the node, then adds `reveal--in`
		// when it scrolls into view. Only applied client-side and skipped under reduced
		// motion, so the default (no class) is always fully visible.
		&.reveal {
			opacity: 0;
			transform: translateY(16px);
			transition:
				opacity 450ms ease,
				transform 450ms ease;
		}

		&.reveal--in {
			opacity: 1;
			transform: none;
		}

		// Connector: runs from this node's marker down to the next node. Coloured
		// by whether this node is completed (the "travelled" part of the journey).
		&:not(:last-child)::after {
			content: '';
			position: absolute;
			top: 40px;
			left: 21px;
			bottom: 0;
			width: 2px;
			background-color: var(--border-default-strong);
		}

		&--done::after {
			background-color: var(--success);
		}
	}

	.journey__link {
		position: relative;
		display: grid;
		grid-template-columns: 44px 1fr;
		grid-template-areas:
			'marker date'
			'marker name'
			'marker caption'
			'marker more';
		align-items: center;
		gap: 0 16px;
		padding-bottom: 28px;
		text-decoration: none;
		border-radius: var(--radius-base);

		&:focus-visible {
			outline: none;
			box-shadow: 0 0 0 3px var(--brand-medium);
		}

		// Only real links (not upcoming milestones) get the interactive cursor + hover cue.
		&:not(div) {
			cursor: pointer;
		}

		&:not(div):hover .journey__name {
			color: var(--brand);
		}
	}

	.journey__date {
		grid-area: date;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		color: var(--text-body-subtle);

		i {
			font-size: 13px;
		}
	}

	.journey__marker {
		grid-area: marker;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: var(--radius-full);
		// Halo masks the connector line running behind the marker.
		box-shadow: 0 0 0 4px var(--neutral-primary-soft);

		i {
			font-size: 22px;
		}

		// Completed keeps the solid green disc + white tick. Active/upcoming use the
		// ProgressRing (amber→green), so their wrapper stays transparent.
		.journey__node--done & {
			color: var(--text-white);
			background-color: var(--success);
		}
	}

	.journey__name {
		grid-area: name;
		margin-top: 2px;
		font-size: 15px;
		font-weight: 600;
		line-height: 1.3;
		color: var(--text-heading);
		transition: color 200ms;

		.journey__node--upcoming & {
			color: var(--text-body);
		}
	}

	// Layout only — colour + shape come from the global `.badge` (tokens.scss).
	.journey__caption {
		grid-area: caption;
		justify-self: start;
		margin-top: 4px;
	}

	// Always-visible affordance so clients know the milestone opens a page.
	.journey__more {
		grid-area: more;
		display: inline-flex;
		align-items: center;
		gap: 2px;
		margin-top: 8px;
		font-size: 12px;
		font-weight: 600;
		color: var(--fg-brand);

		i {
			font-size: 15px;
			transition: transform 200ms;
		}
	}

	.journey__link:hover .journey__more i,
	.journey__link:focus-visible .journey__more i {
		transform: translateX(3px);
	}

	// --- Journey timeline (desktop = horizontal row of nodes) ---
	@media (min-width: 769px) {
		// Both cards fit on screen at once, so the mobile scroll cue is redundant.
		.scroll-nudge {
			display: none;
		}

		.journey {
			flex-direction: row;
			align-items: flex-start;
			overflow-x: auto;
			padding-bottom: 4px;
		}

		.journey__node {
			flex: 1 0 0;
			min-width: 120px;

			&:not(:last-child)::after {
				top: 50px;
				left: 50%;
				bottom: auto;
				width: 100%;
				height: 2px;
			}
		}

		.journey__link {
			grid-template-columns: 1fr;
			grid-template-areas:
				'date'
				'marker'
				'name'
				'caption'
				'more';
			justify-items: center;
			gap: 6px 0;
			padding: 0 8px 4px;
			text-align: center;
		}

		.journey__date {
			height: 24px;
		}

		.journey__name {
			margin-top: 8px;
		}

		.journey__caption {
			justify-self: center;
		}
	}

	// --- Shared bits ---
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
</style>
