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

// A "Live preview" link: a labelled http(s) URL, validated with the URL parser.
function isHttpUrl(value: string): boolean {
	try {
		const u = new URL(value);
		return u.protocol === 'http:' || u.protocol === 'https:';
	} catch {
		return false;
	}
}

const linkSchema = z.object({
	url: z
		.string()
		.trim()
		.min(1, 'Add a URL.')
		.max(2048)
		.refine(isHttpUrl, 'Enter a valid http(s) link.'),
	label: z.string().trim().min(1, 'Add a label.').max(60)
});

const linksSchema = z.array(linkSchema).max(20).optional();

const patchSchema = z
	.object({
		title: z.string().trim().min(1, 'A title is required.').max(200),
		description: z.string().trim().max(2000).nullable().optional(),
		status: z.enum(timelineStatuses),
		requiredAction: z.string().trim().max(500).nullable().optional(),
		entryDate: z.iso.date(),
		links: linksSchema
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

	// "Live preview" links. Like the title/description, these are frozen once the scope
	// is finalized (only status + date may change then), so we only touch them in draft
	// mode. PATCH replaces the whole set: clear the existing rows, then insert the new
	// order. When frozen — or the field wasn't sent — we return the current set untouched.
	let links: { id: string; url: string; label: string; position: number }[] = [];
	if (!finalized && input.links !== undefined) {
		const { error: delError } = await locals.supabase
			.from('timeline_update_links')
			.delete()
			.eq('update_id', id);
		if (delError) {
			console.error('[timeline-updates] link clear failed:', delError);
			return json({ message: 'Could not save the links. Please try again.' }, { status: 500 });
		}
		if (input.links.length > 0) {
			const { data: linkRows, error: linkError } = await locals.supabase
				.from('timeline_update_links')
				.insert(
					input.links.map((l, i) => ({ update_id: id, url: l.url, label: l.label, position: i }))
				)
				.select('id, url, label, position');
			if (linkError) {
				console.error('[timeline-updates] link insert failed:', linkError);
				return json({ message: 'Could not save the links. Please try again.' }, { status: 500 });
			}
			links = linkRows ?? [];
		}
	} else {
		const { data: linkRows } = await locals.supabase
			.from('timeline_update_links')
			.select('id, url, label, position')
			.eq('update_id', id)
			.order('position', { ascending: true });
		links = linkRows ?? [];
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
	return json({
		update: { ...update, links },
		milestoneStatus,
		milestoneProgress,
		milestoneStartDate
	});
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
