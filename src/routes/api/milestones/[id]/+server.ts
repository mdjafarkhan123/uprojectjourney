import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { syncMilestone } from '$lib/server/milestone-status';

// Edit a single milestone. Admin-only; RLS on `milestones` allows the write only
// when the parent project belongs to this admin, so no extra ownership check is
// needed here. All fields optional (partial update); `position` changes drive
// reordering.
//
// `progress` is NOT editable here — it is derived from the milestone's work items
// (completed / total) and cached server-side. `weight` is the milestone's relative
// contribution to the project total; `scopeFinalized` toggles Draft ↔ Finalized.
const patchSchema = z
	.object({
		name: z.string().trim().min(1, 'Milestone name is required.').max(120).optional(),
		status: z.enum(['not_started', 'open', 'in_progress', 'completed']).optional(),
		weight: z.number().min(0, 'Weight cannot be negative.').max(1000).optional(),
		scopeFinalized: z.boolean().optional(),
		startDate: z.iso.date().nullable().optional(),
		expectedCompletionDate: z.iso.date().nullable().optional(),
		overview: z.string().trim().max(2000).nullable().optional(),
		position: z.number().int().min(0).optional()
	})
	.refine((obj) => Object.keys(obj).length > 0, { message: 'Nothing to update.' });

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid milestone id.' }, { status: 400 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				message: 'Please check the form and try again.',
				errors: z.flattenError(parsed.error).fieldErrors
			},
			{ status: 400 }
		);
	}
	const input = parsed.data;

	const update: {
		name?: string;
		status?: 'not_started' | 'open' | 'in_progress' | 'completed';
		weight?: number;
		scope_finalized?: boolean;
		start_date?: string | null;
		expected_completion_date?: string | null;
		overview?: string | null;
		position?: number;
	} = {};
	if (input.name !== undefined) update.name = input.name;
	if (input.status !== undefined) update.status = input.status;
	if (input.weight !== undefined) update.weight = input.weight;
	if (input.scopeFinalized !== undefined) update.scope_finalized = input.scopeFinalized;
	if (input.startDate !== undefined) update.start_date = input.startDate;
	if (input.expectedCompletionDate !== undefined)
		update.expected_completion_date = input.expectedCompletionDate;
	if (input.overview !== undefined) update.overview = input.overview || null;
	if (input.position !== undefined) update.position = input.position;

	const { data, error } = await locals.supabase
		.from('milestones')
		.update(update)
		.eq('id', id)
		.select(
			'id, name, status, progress, weight, scope_finalized, position, start_date, expected_completion_date, overview'
		)
		.maybeSingle();

	if (error) {
		console.error('[milestones] update failed:', error);
		return json({ message: 'Could not update the milestone. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Milestone not found.' }, { status: 404 });
	}

	// Completing a milestone cascades down: mark every one of its work items
	// `completed` (and clear any waiting-for-client asks, no longer applicable), then
	// set progress to 100%. The admin's explicit `completed` status is authoritative
	// here, so we DON'T re-derive it — the cascade makes the derived value agree
	// anyway. Any single item can still be reopened afterwards (manual override),
	// which re-derives the milestone out of `completed` on the next timeline change.
	if (input.status === 'completed') {
		const { error: cascadeError } = await locals.supabase
			.from('timeline_updates')
			.update({ status: 'completed', required_action: null })
			.eq('milestone_id', id)
			.neq('status', 'completed');
		if (cascadeError) {
			console.error('[milestones] completing cascade failed:', cascadeError);
			return json(
				{ message: 'Could not complete the milestone. Please try again.' },
				{ status: 500 }
			);
		}

		const { count, error: countError } = await locals.supabase
			.from('timeline_updates')
			.select('id', { count: 'exact', head: true })
			.eq('milestone_id', id);
		if (countError) {
			console.error('[milestones] item count after cascade failed:', countError);
		} else {
			const progress = count && count > 0 ? 100 : (data.progress ?? 0);
			const { error: progressError } = await locals.supabase
				.from('milestones')
				.update({ progress })
				.eq('id', id);
			if (progressError) {
				console.error('[milestones] progress update after cascade failed:', progressError);
			} else {
				data.progress = progress;
			}
		}
	}

	// Finalizing the scope activates progress tracking — make sure the cached
	// progress reflects the current items right now (and refresh derived status).
	if (input.scopeFinalized === true) {
		try {
			const synced = await syncMilestone(locals.supabase, id);
			if (synced) {
				data.progress = synced.progress;
				data.status = synced.status;
			}
		} catch (syncError) {
			console.error('[milestones] progress sync on finalize failed:', syncError);
		}
	}

	return json({ milestone: data });
};

// Delete a milestone. Admin-only; RLS allows the delete only when the parent
// project belongs to this admin. Its timeline updates cascade away with it.
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid milestone id.' }, { status: 400 });
	}

	const { data, error } = await locals.supabase
		.from('milestones')
		.delete()
		.eq('id', id)
		.select('id')
		.maybeSingle();

	if (error) {
		console.error('[milestones] delete failed:', error);
		return json({ message: 'Could not delete the milestone. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Milestone not found.' }, { status: 404 });
	}

	return json({ id: data.id });
};
