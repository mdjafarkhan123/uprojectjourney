import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { syncMilestone } from '$lib/server/milestone-status';

// Edit or delete a single timeline update. Admin-only; RLS on `timeline_updates`
// allows the write only when the parent milestone's project belongs to this admin,
// so no extra ownership check is needed. The edit form always sends the full field
// set, so this is a full (non-partial) update. `required_action` is REQUIRED when
// status is `waiting_for_client`, and cleared to null otherwise.
const timelineStatuses = [
	'not_started',
	'in_progress',
	'waiting_for_client',
	'under_review',
	'completed'
] as const;

const patchSchema = z
	.object({
		title: z.string().trim().min(1, 'A title is required.').max(200),
		description: z.string().trim().max(2000).nullable().optional(),
		status: z.enum(timelineStatuses),
		requiredAction: z.string().trim().max(500).nullable().optional(),
		entryDate: z.iso.date()
	})
	.refine(
		(obj) =>
			obj.status !== 'waiting_for_client' ||
			(typeof obj.requiredAction === 'string' && obj.requiredAction.trim().length > 0),
		{
			message: 'A Required Action message is needed while waiting for the client.',
			path: ['requiredAction']
		}
	);

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid update id.' }, { status: 400 });
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

	// Look up the item and whether its milestone's scope is finalized. When
	// finalized, only the item's STATUS (and its dependent required-action) and its
	// DATE may change — title/description are frozen until the admin clicks Edit Scope.
	const { data: existing, error: existingError } = await locals.supabase
		.from('timeline_updates')
		.select('id, milestones(scope_finalized)')
		.eq('id', id)
		.maybeSingle();

	if (existingError) {
		console.error('[timeline-updates] lookup failed:', existingError);
		return json({ message: 'Could not update the entry. Please try again.' }, { status: 500 });
	}
	if (!existing) {
		return json({ message: 'Update not found.' }, { status: 404 });
	}
	const finalized = (existing.milestones as { scope_finalized: boolean } | null)?.scope_finalized;

	const updateFields = finalized
		? {
				status: input.status,
				required_action:
					input.status === 'waiting_for_client' ? input.requiredAction || null : null,
				entry_date: input.entryDate
			}
		: {
				title: input.title,
				description: input.description || null,
				status: input.status,
				required_action:
					input.status === 'waiting_for_client' ? input.requiredAction || null : null,
				entry_date: input.entryDate
			};

	const { data, error } = await locals.supabase
		.from('timeline_updates')
		.update(updateFields)
		.eq('id', id)
		.select('id, milestone_id, title, description, status, required_action, entry_date, created_at')
		.maybeSingle();

	if (error) {
		console.error('[timeline-updates] update failed:', error);
		return json({ message: 'Could not update the entry. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Update not found.' }, { status: 404 });
	}

	// Re-derive the parent milestone's status + progress from its items (e.g. flipping
	// an item to `completed` bumps progress; to `in_progress` moves status). Returned
	// so the client can patch the milestone badge + bar without a refetch.
	let milestoneStatus: string | null = null;
	let milestoneProgress: number | null = null;
	let milestoneStartDate: string | null = null;
	try {
		const synced = await syncMilestone(locals.supabase, data.milestone_id);
		milestoneStatus = synced?.status ?? null;
		milestoneProgress = synced?.progress ?? null;
		milestoneStartDate = synced?.startDate ?? null;
	} catch (syncError) {
		console.error('[timeline-updates] milestone sync failed:', syncError);
	}

	const { milestone_id, ...update } = data;
	void milestone_id;
	return json({ update, milestoneStatus, milestoneProgress, milestoneStartDate });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid update id.' }, { status: 400 });
	}

	// Scope lock: no deleting items once the milestone's scope is finalized. Check
	// first so we return a clean 409 instead of silently doing nothing.
	const { data: existing, error: existingError } = await locals.supabase
		.from('timeline_updates')
		.select('id, milestones(scope_finalized)')
		.eq('id', id)
		.maybeSingle();

	if (existingError) {
		console.error('[timeline-updates] lookup failed:', existingError);
		return json({ message: 'Could not delete the entry. Please try again.' }, { status: 500 });
	}
	if (!existing) {
		return json({ message: 'Update not found.' }, { status: 404 });
	}
	if ((existing.milestones as { scope_finalized: boolean } | null)?.scope_finalized) {
		return json(
			{ message: 'This milestone is finalized. Click Edit Scope to remove items.' },
			{ status: 409 }
		);
	}

	// Delete only if RLS makes the row visible to this admin; `.select()` lets us
	// tell "deleted" from "not yours / already gone".
	const { data, error } = await locals.supabase
		.from('timeline_updates')
		.delete()
		.eq('id', id)
		.select('id, milestone_id')
		.maybeSingle();

	if (error) {
		console.error('[timeline-updates] delete failed:', error);
		return json({ message: 'Could not delete the entry. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Update not found.' }, { status: 404 });
	}

	// Re-derive the parent milestone's status + progress now that an item is gone
	// (removing the last item drops status to `not_started`). Returned so the client
	// can patch the milestone badge + bar without a refetch.
	let milestoneStatus: string | null = null;
	let milestoneProgress: number | null = null;
	let milestoneStartDate: string | null = null;
	try {
		const synced = await syncMilestone(locals.supabase, data.milestone_id);
		milestoneStatus = synced?.status ?? null;
		milestoneProgress = synced?.progress ?? null;
		milestoneStartDate = synced?.startDate ?? null;
	} catch (syncError) {
		console.error('[timeline-updates] milestone sync failed:', syncError);
	}

	return json({ id: data.id, milestoneStatus, milestoneProgress, milestoneStartDate });
};
