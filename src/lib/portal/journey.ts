// Pure view-model helpers shared by the portal home (journey) and the milestone
// detail page. No side effects, no DOM — safe to unit-reason about.

import type {
	Milestone,
	MilestoneStatus,
	PortalProject,
	ProjectStatus,
	TimelineStatus,
	TimelineUpdate
} from './types';

type BadgeMeta = { label: string; className: string };

export const projectStatusMeta: Record<ProjectStatus, BadgeMeta> = {
	planning: { label: 'Planning', className: 'badge--gray' },
	in_progress: { label: 'In progress', className: 'badge--progress' },
	waiting_for_client: { label: 'Waiting on you', className: 'badge--waiting' },
	under_review: { label: 'Under review', className: 'badge--review' },
	completed: { label: 'Completed', className: 'badge--success' }
};

export const timelineStatusMeta: Record<TimelineStatus, BadgeMeta> = {
	not_started: { label: 'Not started', className: 'badge--gray' },
	in_progress: { label: 'In progress', className: 'badge--progress' },
	waiting_for_client: { label: 'Waiting on you', className: 'badge--waiting' },
	under_review: { label: 'Under review', className: 'badge--review' },
	completed: { label: 'Completed', className: 'badge--success' }
};

// Icon for each timeline status — shown inside the journey/timeline node markers.
export const timelineStatusIcon: Record<TimelineStatus, string> = {
	not_started: 'ri-time-line',
	in_progress: 'ri-loader-4-line',
	waiting_for_client: 'ri-alarm-warning-line',
	under_review: 'ri-eye-line',
	completed: 'ri-check-line'
};

// Build a local Date from the y-m-d parts so the label never shifts a day due to
// UTC parsing (same guard the admin side uses).
export function formatDate(iso: string | null): string {
	if (!iso) return '—';
	const [y, m, d] = iso.split('-').map(Number);
	if (!y || !m || !d) return '—';
	return new Date(y, m - 1, d).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

// Format a full timestamp (date + time) for "last updated" signals. Unlike
// `formatDate`, the input is a real timestamptz, so we let the Date parse it and
// render in the viewer's local timezone.
export function formatDateTime(iso: string | null): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

// Build a local Date from a `y-m-d` string (no day shift), or parse a full
// timestamptz as-is. Small shared guard for the relative formatter below.
function toDate(iso: string): Date | null {
	if (iso.length <= 10) {
		const [y, m, d] = iso.split('-').map(Number);
		if (!y || !m || !d) return null;
		return new Date(y, m - 1, d);
	}
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? null : d;
}

// Compact, human "time ago" for freshness signals — the label clients read
// fastest, especially on mobile (the GitHub/Linear/Slack pattern). The call site
// keeps the exact timestamp in a `title` tooltip. Falls back to an absolute date
// once we're past a week, where "37d ago" stops being useful.
export function formatRelative(iso: string | null): string {
	if (!iso) return '—';
	const then = toDate(iso);
	if (!then) return '—';
	const diffMs = Date.now() - then.getTime();
	if (diffMs < 0) return formatDate(iso.slice(0, 10));
	const mins = Math.round(diffMs / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days === 1) return 'yesterday';
	if (days < 7) return `${days}d ago`;
	return formatDate(iso.slice(0, 10));
}

export type NodeState = 'done' | 'active' | 'upcoming';

// How a milestone renders on the journey: completed → done (✓); open/in_progress
// → active (brand, shows %); not_started → upcoming (soft, never disabled).
export function nodeState(m: Milestone): NodeState {
	if (m.status === 'completed') return 'done';
	if (m.status === 'in_progress' || m.status === 'open') return 'active';
	return 'upcoming';
}

export function milestoneCaption(m: Milestone): string {
	switch (nodeState(m)) {
		case 'done':
			return 'Completed';
		case 'active':
			return 'In progress';
		default:
			return 'Upcoming';
	}
}

// Client-facing status label for a milestone badge. `open` (has updates but none
// active yet) reads as "In progress" for the client — the internal distinction
// isn't meaningful to them. Aligns with the node state so badge colour + text agree.
export function milestoneStatusLabel(m: Milestone): string {
	return milestoneCaption(m);
}

// Auto-derive the PROJECT-level status from its milestones + their timeline items —
// the same "status always reflects reality" philosophy the milestone status and
// progress already use, so a project can never sit on a stale hand-set value.
//
// Rule (coldest → most complete):
//   - no milestones, or every milestone still `not_started` → `planning`
//   - every milestone `completed`                           → `completed`
//   - otherwise work is underway; pick the most client-salient live signal across
//     every milestone's timeline items:
//       any item `waiting_for_client` → `waiting_for_client` (the client is blocking)
//       else any item `under_review`  → `under_review`
//       else                          → `in_progress`
//
// `waiting_for_client` outranks `under_review` on purpose: a project blocked on the
// client is the thing they most need to see.
export function deriveProjectStatus(
	milestones: { status: MilestoneStatus; timeline_updates: { status: string }[] }[]
): ProjectStatus {
	if (milestones.length === 0) return 'planning';
	if (milestones.every((m) => m.status === 'completed')) return 'completed';
	if (milestones.every((m) => m.status === 'not_started')) return 'planning';

	const timelineStatuses = milestones.flatMap((m) =>
		(m.timeline_updates ?? []).map((t) => t.status)
	);
	if (timelineStatuses.includes('waiting_for_client')) return 'waiting_for_client';
	if (timelineStatuses.includes('under_review')) return 'under_review';
	return 'in_progress';
}

// The active milestone: the first one not yet completed (milestones arrive ordered
// by position). Null when every milestone is done.
export function currentMilestone(project: PortalProject): Milestone | null {
	const index = project.milestones.findIndex((m) => m.status !== 'completed');
	return index >= 0 ? project.milestones[index] : null;
}

// Latest timeline entry across every milestone. Each milestone's list arrives
// oldest-first, so the newest entry is the LAST one. Used for the "last updated"
// line and the overview's latest tile.
export function latestUpdate(milestones: Milestone[]): TimelineUpdate | null {
	let best: TimelineUpdate | null = null;
	for (const m of milestones) {
		const newest = m.timeline_updates[m.timeline_updates.length - 1];
		if (!newest) continue;
		if (
			!best ||
			newest.entry_date > best.entry_date ||
			(newest.entry_date === best.entry_date && newest.created_at > best.created_at)
		) {
			best = newest;
		}
	}
	return best;
}

// --- Delivery countdown ---------------------------------------------------

// Graduated urgency, coldest → hottest: the pill colour shifts as delivery nears so
// the client reads the risk at a glance before the number.
export type DeliveryTone = 'normal' | 'soon' | 'urgent' | 'due' | 'overdue';

export type DeliveryCountdown = {
	totalLabel: string; // planned span, humanised (e.g. "3 days", "18 hours")
	remainingLabel: string; // e.g. "18 hours left", "40 min overdue"
	percentRemaining: number | null; // share of the planned span still left (0–100)
	tone: DeliveryTone; // colour, driven by `percentRemaining` (proportional urgency)
	hasDate: boolean;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// End of the given calendar date in local time (23:59:59.999) — the instant a
// date-only deadline actually lapses.
function endOfLocalDay(iso: string): Date | null {
	const d = toDate(iso);
	if (!d) return null;
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// Whole-unit human duration that coarsens as it grows: minutes under an hour, hours
// under two days, then days. Rounds up so a live countdown never reads "0".
function humanizeSpan(ms: number): string {
	if (ms < HOUR_MS) {
		const mins = Math.max(1, Math.ceil(ms / 60_000));
		return `${mins} min`;
	}
	if (ms < 2 * DAY_MS) {
		const hours = Math.ceil(ms / HOUR_MS);
		return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
	}
	const days = Math.ceil(ms / DAY_MS);
	return `${days} ${days === 1 ? 'day' : 'days'}`;
}

// Countdown to the expected delivery for the overview tile. The delivery is a date (no
// time), so the deadline is anchored to the END of that day. The remaining time is
// shown as a humanised span (so short, hours-long projects stay precise), while the
// colour/urgency is driven by how much of the PLANNED SPAN is still left as a
// percentage — so "1 day left" reads calm on a 60-day plan but critical on a 3-day one.
// `now` is injectable for testing.
export function deliveryCountdown(
	project: PortalProject,
	now: Date = new Date()
): DeliveryCountdown {
	const delivery = project.expected_delivery_date;
	const target = delivery ? endOfLocalDay(delivery) : null;
	if (!target) {
		return {
			totalLabel: '',
			remainingLabel: '',
			percentRemaining: null,
			tone: 'normal',
			hasDate: false
		};
	}

	const start = toDate(project.created_at.slice(0, 10));
	const totalMs = start ? target.getTime() - start.getTime() : null;
	const totalLabel = totalMs && totalMs > 0 ? humanizeSpan(totalMs) : '';

	const remainingMs = target.getTime() - now.getTime();

	// Share of the planned span still remaining (0–100). Null when there's no positive
	// total to divide by, in which case tone falls back to an absolute time threshold.
	const percentRemaining =
		totalMs && totalMs > 0
			? Math.min(100, Math.max(0, Math.round((remainingMs / totalMs) * 100)))
			: null;

	let remainingLabel: string;
	let tone: DeliveryTone;
	if (remainingMs <= 0) {
		remainingLabel = `${humanizeSpan(-remainingMs)} overdue`;
		tone = 'overdue';
	} else {
		remainingLabel = `${humanizeSpan(remainingMs)} left`;
		if (percentRemaining !== null) {
			if (percentRemaining <= 10) tone = 'due';
			else if (percentRemaining <= 25) tone = 'urgent';
			else if (percentRemaining <= 50) tone = 'soon';
			else tone = 'normal';
		} else {
			const hours = remainingMs / HOUR_MS;
			if (hours <= 6) tone = 'due';
			else if (hours <= 48) tone = 'urgent';
			else if (hours <= 24 * 7) tone = 'soon';
			else tone = 'normal';
		}
	}

	return { totalLabel, remainingLabel, percentRemaining, tone, hasDate: true };
}

export type WaitingItem = { id: string; milestoneName: string; required_action: string };

export type Overview = {
	currentFocusTitle: string;
	currentFocusGoal: string;
	nextStepTitle: string;
	nextStepSub: string;
	waiting: WaitingItem[];
};

function isWaiting(u: TimelineUpdate): u is TimelineUpdate & { required_action: string } {
	return u.status === 'waiting_for_client' && !!u.required_action;
}

// Answers the four at-a-glance questions from the milestone + timeline data. The
// milestones arrive ordered by position from the API.
export function buildOverview(project: PortalProject): Overview {
	const milestones = project.milestones;
	const currentIndex = milestones.findIndex((m) => m.status !== 'completed');
	const current = currentIndex >= 0 ? milestones[currentIndex] : null;

	// Admin-authored focus wins; otherwise fall back to the active milestone.
	const currentFocusTitle =
		project.current_focus_title?.trim() ||
		current?.name ||
		(milestones.length > 0 ? 'All milestones complete' : 'Getting started');
	const currentFocusGoal = project.current_focus_goal?.trim() || '';

	// Next step = the milestone after the current one.
	let nextStepTitle: string;
	let nextStepSub: string;
	if (!current) {
		nextStepTitle = milestones.length > 0 ? 'Project wrapping up' : 'To be scheduled';
		nextStepSub = '';
	} else {
		const next = milestones[currentIndex + 1];
		if (next) {
			nextStepTitle = next.name;
			nextStepSub = next.start_date ? `Estimated start ${formatDate(next.start_date)}` : 'Upcoming';
		} else {
			nextStepTitle = 'Final milestone';
			nextStepSub = 'This is the last phase of your project.';
		}
	}

	const waiting: WaitingItem[] = [];
	for (const m of milestones) {
		for (const u of m.timeline_updates) {
			if (isWaiting(u)) {
				waiting.push({ id: u.id, milestoneName: m.name, required_action: u.required_action });
			}
		}
	}

	return { currentFocusTitle, currentFocusGoal, nextStepTitle, nextStepSub, waiting };
}
