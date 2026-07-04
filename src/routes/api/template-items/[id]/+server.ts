import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// Edit a single template item. Admin-only; RLS on `template_items` allows the write
// only when the item's template belongs to this admin, so no extra ownership check is
// needed. All fields optional (partial update); `position` changes drive reordering
// within the milestone.
const timelineStatuses = [
	'not_started',
	'in_progress',
	'waiting_for_client',
	'under_review',
	'completed'
] as const;

const patchSchema = z
	.object({
		title: z.string().trim().min(1, 'A title is required.').max(200).optional(),
		description: z.string().trim().max(2000).nullable().optional(),
		defaultStatus: z.enum(timelineStatuses).optional(),
		position: z.number().int().min(0).optional()
	})
	.refine((obj) => Object.keys(obj).length > 0, { message: 'Nothing to update.' });

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid item id.' }, { status: 400 });
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
		title?: string;
		description?: string | null;
		default_status?: (typeof timelineStatuses)[number];
		position?: number;
	} = {};
	if (input.title !== undefined) update.title = input.title;
	if (input.description !== undefined) update.description = input.description || null;
	if (input.defaultStatus !== undefined) update.default_status = input.defaultStatus;
	if (input.position !== undefined) update.position = input.position;

	const { data, error } = await locals.supabase
		.from('template_items')
		.update(update)
		.eq('id', id)
		.select('id, title, description, default_status, position')
		.maybeSingle();

	if (error) {
		console.error('[template-items] update failed:', error);
		return json({ message: 'Could not update the item. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Item not found.' }, { status: 404 });
	}

	return json({ item: data });
};

// Delete a template item. Admin-only; RLS allows the delete only when the item's
// template belongs to this admin.
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid item id.' }, { status: 400 });
	}

	const { data, error } = await locals.supabase
		.from('template_items')
		.delete()
		.eq('id', id)
		.select('id')
		.maybeSingle();

	if (error) {
		console.error('[template-items] delete failed:', error);
		return json({ message: 'Could not delete the item. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Item not found.' }, { status: 404 });
	}

	return json({ id: data.id });
};
