import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// Fetch one template with its full milestone → item tree, for the editor. Admin-only;
// RLS scopes the read to this admin's own templates, so an unknown/foreign id simply
// returns no row → clean 404. PostgREST nested ordering can be finicky two levels
// deep, so we sort milestones and items by `position` here to guarantee order.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid template id.' }, { status: 400 });
	}

	const { data, error } = await locals.supabase
		.from('templates')
		.select(
			'id, name, icon, description, position, created_at, updated_at, template_milestones(id, name, weight, overview, position, template_items(id, title, description, default_status, position))'
		)
		.eq('id', id)
		.maybeSingle();

	if (error) {
		console.error('[templates] fetch failed:', error);
		return json({ message: 'Could not load the template. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Template not found.' }, { status: 404 });
	}

	const milestones = (data.template_milestones ?? [])
		.map((m) => ({
			id: m.id,
			name: m.name,
			weight: m.weight,
			overview: m.overview,
			position: m.position,
			items: (m.template_items ?? [])
				.map((it) => ({
					id: it.id,
					title: it.title,
					description: it.description,
					default_status: it.default_status,
					position: it.position
				}))
				.sort((a, b) => a.position - b.position)
		}))
		.sort((a, b) => a.position - b.position);

	return json({
		template: {
			id: data.id,
			name: data.name,
			icon: data.icon,
			description: data.description,
			position: data.position,
			created_at: data.created_at,
			updated_at: data.updated_at,
			milestones
		}
	});
};

// Edit a template's own fields. Admin-only; RLS allows the write only when the row
// is this admin's. All fields optional (partial update); `position` changes drive
// reordering in the library grid.
const patchSchema = z
	.object({
		name: z.string().trim().min(1, 'A template name is required.').max(120).optional(),
		icon: z.string().trim().min(1).max(80).optional(),
		description: z.string().trim().max(500).nullable().optional(),
		position: z.number().int().min(0).optional()
	})
	.refine((obj) => Object.keys(obj).length > 0, { message: 'Nothing to update.' });

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid template id.' }, { status: 400 });
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

	const update: { name?: string; icon?: string; description?: string | null; position?: number } =
		{};
	if (input.name !== undefined) update.name = input.name;
	if (input.icon !== undefined) update.icon = input.icon;
	if (input.description !== undefined) update.description = input.description || null;
	if (input.position !== undefined) update.position = input.position;

	const { data, error } = await locals.supabase
		.from('templates')
		.update(update)
		.eq('id', id)
		.select('id, name, icon, description, position, created_at, updated_at')
		.maybeSingle();

	if (error) {
		console.error('[templates] update failed:', error);
		return json({ message: 'Could not update the template. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Template not found.' }, { status: 404 });
	}

	return json({ template: data });
};

// Delete a template. Admin-only; RLS allows the delete only for this admin's own row.
// Its milestones and items cascade away with it (FK ON DELETE CASCADE).
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid template id.' }, { status: 400 });
	}

	const { data, error } = await locals.supabase
		.from('templates')
		.delete()
		.eq('id', id)
		.select('id')
		.maybeSingle();

	if (error) {
		console.error('[templates] delete failed:', error);
		return json({ message: 'Could not delete the template. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Template not found.' }, { status: 404 });
	}

	return json({ id: data.id });
};
