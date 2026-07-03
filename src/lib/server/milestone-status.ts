import type { SupabaseClient } from '@supabase/supabase-js';
import { computeMilestoneProgress } from '$lib/progress';

// Auto-derive a milestone's status from its timeline items.
//
// Rule (see project-tracker skill — status vocabularies):
//   - scope finalized AND ≥1 item AND every item `completed` → `completed`.
//     The milestone auto-completes once its finalized checklist is fully done, and
//     auto-drops back out of `completed` if any item is later reopened (status
//     always reflects reality). Gated on `scope_finalized` so a half-built draft
//     scope can't trip completion early.
//   - any timeline item that is actively being worked on
//     (`in_progress` | `waiting_for_client` | `under_review`) → `in_progress`.
//   - has at least one timeline item, none active, not all-complete → `open`
//     ("has updates but not really started yet").
//   - no timeline items → `not_started`.
//
// The admin can still manually override the status; that pick persists until the
// next timeline change re-derives it. (Explicitly completing a milestone via the
// milestones PATCH route cascades all its items to `completed`, which keeps the
// manual pick and the derived value in agreement — see that route.)

export type MilestoneStatus = 'not_started' | 'open' | 'in_progress' | 'completed';

const ACTIVE_TIMELINE_STATUSES = new Set(['in_progress', 'waiting_for_client', 'under_review']);

export function deriveMilestoneStatus(
	timelineStatuses: string[],
	scopeFinalized: boolean
): MilestoneStatus {
	if (timelineStatuses.length === 0) return 'not_started';
	if (scopeFinalized && timelineStatuses.every((s) => s === 'completed')) return 'completed';
	if (timelineStatuses.some((s) => ACTIVE_TIMELINE_STATUSES.has(s))) return 'in_progress';
	return 'open';
}

// Recompute a milestone's status AND its cached progress from its current timeline
// items, and persist whatever changed. Uses the caller's RLS client, so it only
// touches milestones the admin can see. Returns the resulting { status, progress,
// startDate }, or null if the milestone is no longer visible. Throws on a database
// error so callers can log and 500.
//
// - status: derived per the rules above (completed is admin-owned).
// - progress: completed items / total items (see `computeMilestoneProgress`). This
//   is the cache read by every progress display; scope/weight decide how it rolls
//   up into the project total (see $lib/progress).
// - start_date: auto-set the first time the milestone gets a timeline item. As soon
//   as it has at least one timeline item (any status) and no start date has been
//   recorded yet, we stamp it with the earliest item's entry date. It only ever
//   FILLS a blank — a start date set by hand is never overwritten, and it is never
//   cleared back to null.
export async function syncMilestone(
	supabase: SupabaseClient,
	milestoneId: string
): Promise<{ status: MilestoneStatus; progress: number; startDate: string | null } | null> {
	const { data, error } = await supabase
		.from('milestones')
		.select('status, progress, start_date, scope_finalized, timeline_updates(status, entry_date)')
		.eq('id', milestoneId)
		.maybeSingle();

	if (error) throw error;
	if (!data) return null;

	const current = data.status as MilestoneStatus;
	const currentProgress = (data.progress ?? 0) as number;
	const currentStartDate = (data.start_date ?? null) as string | null;
	const scopeFinalized = (data.scope_finalized ?? false) as boolean;
	const items = (data.timeline_updates ?? []) as { status: string; entry_date: string }[];
	const statuses = items.map((t) => t.status);

	const nextStatus = deriveMilestoneStatus(statuses, scopeFinalized);
	const nextProgress = computeMilestoneProgress(statuses);

	// Auto-fill the start date the first time the milestone has any timeline item
	// and none was set, stamped with the earliest item's entry date.
	let nextStartDate = currentStartDate;
	if (!currentStartDate) {
		const itemDates = items
			.map((t) => t.entry_date)
			.filter((d): d is string => typeof d === 'string' && d.length > 0);
		if (itemDates.length > 0) {
			nextStartDate = itemDates.reduce((earliest, d) => (d < earliest ? d : earliest));
		}
	}

	const update: { status: MilestoneStatus; progress: number; start_date?: string } = {
		status: nextStatus,
		progress: nextProgress
	};
	const startDateChanged = nextStartDate !== currentStartDate;
	if (startDateChanged && nextStartDate) update.start_date = nextStartDate;

	if (nextStatus !== current || nextProgress !== currentProgress || startDateChanged) {
		const { error: updateError } = await supabase
			.from('milestones')
			.update(update)
			.eq('id', milestoneId);
		if (updateError) throw updateError;
	}

	return { status: nextStatus, progress: nextProgress, startDate: nextStartDate };
}
