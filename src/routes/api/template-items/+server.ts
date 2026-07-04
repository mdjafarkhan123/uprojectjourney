import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// Create a work item under a template milestone. Admin-only; RLS on `template_items`
// allows the insert only when the milestone's template belongs to this admin. We also
// verify the milestone is visible first so a bad/foreign id returns a clean 404
// instead of a raw RLS failure. New items start at the end of the list (position =
// max + 1) with a `not_started` default status (what a fresh project item begins as).
const timelineStatuses = [
	'not_started',
	'in_progress',
	'waiting_for_client',
	'under_review',
	'completed'
] as const;

const createSchema = z.object({
	templateMilestoneId: z.uuid(),
	title: z.string().trim().min(1, 'A title is required.').max(200),
	description: z.string().trim().max(2000).nullable().optional(),
	defaultStatus: z.enum(timelineStatuses).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				message: 'Please check the form and try again.',
				errors: z.flattenError(parsed.error).fieldErrors
			},
			{ status: 400 }
		);
	}
	const { templateMilestoneId, title, description, defaultStatus } = parsed.data;

	// Confirm the parent milestone is visible to this admin under RLS.
	const { data: milestone, error: milestoneError } = await locals.supabase
		.from('template_milestones')
		.select('id')
		.eq('id', templateMilestoneId)
		.maybeSingle();

	if (milestoneError) {
		console.error('[template-items] milestone lookup failed:', milestoneError);
		return json({ message: 'Could not add the item. Please try again.' }, { status: 500 });
	}
	if (!milestone) {
		return json({ message: 'Milestone not found.' }, { status: 404 });
	}

	// Next position = highest existing position + 1 (0 for the first item).
	const { data: last, error: posError } = await locals.supabase
		.from('template_items')
		.select('position')
		.eq('template_milestone_id', templateMilestoneId)
		.order('position', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (posError) {
		console.error('[template-items] position lookup failed:', posError);
		return json({ message: 'Could not add the item. Please try again.' }, { status: 500 });
	}
	const position = (last?.position ?? -1) + 1;

	const { data, error } = await locals.supabase
		.from('template_items')
		.insert({
			template_milestone_id: templateMilestoneId,
			title,
			description: description || null,
			default_status: defaultStatus ?? 'not_started',
			position
		})
		.select('id, title, description, default_status, position')
		.single();

	if (error) {
		console.error('[template-items] create failed:', error);
		return json({ message: 'Could not add the item. Please try again.' }, { status: 500 });
	}

	return json({ item: data }, { status: 201 });
};
