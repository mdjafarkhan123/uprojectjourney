// Progress math for the milestone-scope system (see PLAN.md).
//
// A milestone's own progress is DERIVED from its work items:
//   progress = completed items / total items.
// It is no longer entered by hand. The value is cached in `milestones.progress`
// (recomputed server-side on every item change) so read paths that don't load the
// item list stay cheap.
//
// Overall project progress is a WEIGHTED, auto-normalized blend of its milestones.
// Weights are relative — they never have to add up to 100. A milestone that is
// still in Draft (scope not finalized) contributes 0 (its weight stays in the
// denominator), so the overall number only climbs as scopes are finalized and
// items complete.
//
// This module is intentionally free of server-only imports so both the API routes
// and the `.svelte` pages can share one source of truth.

/**
 * Milestone progress from its work-item statuses. Only `completed` items count.
 * Floor of 1% once the milestone has any item at all — so the client always sees a
 * real number rather than a bare 0 the moment work is scoped. Truly empty (no items)
 * stays 0.
 */
export function computeMilestoneProgress(itemStatuses: string[]): number {
	if (itemStatuses.length === 0) return 0;
	const completed = itemStatuses.filter((s) => s === 'completed').length;
	return Math.max(1, Math.round((completed / itemStatuses.length) * 100));
}

/** What a milestone actually contributes: its progress once finalized, else 0. */
export function effectiveProgress(m: { progress: number; scope_finalized: boolean }): number {
	return m.scope_finalized ? (m.progress ?? 0) : 0;
}

/**
 * Weighted overall project progress (0–100, rounded).
 * - Draft milestones count as 0% (weight stays in the denominator).
 * - Falls back to equal weighting if every weight is 0.
 * - Returns 0 for a project with no milestones.
 */
export function computeOverallProgress(
	milestones: { progress: number; weight: number; scope_finalized: boolean }[]
): number {
	if (milestones.length === 0) return 0;

	let totalWeight = milestones.reduce((sum, m) => sum + (m.weight ?? 0), 0);
	const equalFallback = totalWeight <= 0;
	if (equalFallback) totalWeight = milestones.length;

	const weighted = milestones.reduce((sum, m) => {
		const w = equalFallback ? 1 : (m.weight ?? 0);
		return sum + w * effectiveProgress(m);
	}, 0);

	return Math.round(weighted / totalWeight);
}
