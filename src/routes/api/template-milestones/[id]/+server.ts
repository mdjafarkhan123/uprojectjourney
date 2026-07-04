import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// Edit a single template milestone. Admin-only; RLS on `template_milestones` allows
// the write only when the parent template belongs to this admin, so no extra
// ownership check is needed. All fields optional (partial update); `position`
// changes drive reordering within the template.
const patchSchema = z
	.object({
		name: z.string().trim().min(1, 'A milestone name is required.').max(120).optional(),
		weight: z.number().min(0, 'Weight cannot be negative.').max(1000).optional(),
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

	const update: { name?: string; weight?: number; overview?: string | null; position?: number } =
		{};
	if (input.name !== undefined) update.name = input.name;
	if (input.weight !== undefined) update.weight = input.weight;
	if (input.overview !== undefined) update.overview = input.overview || null;
	if (input.position !== undefined) update.position = input.position;

	const { data, error } = await locals.supabase
		.from('template_milestones')
		.update(update)
		.eq('id', id)
		.select('id, name, weight, overview, position')
		.maybeSingle();

	if (error) {
		console.error('[template-milestones] update failed:', error);
		return json({ message: 'Could not update the milestone. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Milestone not found.' }, { status: 404 });
	}

	return json({ milestone: data });
};

// Delete a template milestone. Admin-only; RLS allows the delete only when the parent
// template belongs to this admin. Its items cascade away with it (FK ON DELETE CASCADE).
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid milestone id.' }, { status: 400 });
	}

	const { data, error } = await locals.supabase
		.from('template_milestones')
		.delete()
		.eq('id', id)
		.select('id')
		.maybeSingle();

	if (error) {
		console.error('[template-milestones] delete failed:', error);
		return json({ message: 'Could not delete the milestone. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Milestone not found.' }, { status: 404 });
	}

	return json({ id: data.id });
};
