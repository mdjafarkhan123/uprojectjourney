import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// List this admin's workflow templates for the library grid. Reads go through the
// RLS-enforced client, so rows are already scoped to the caller. Each card shows a
// milestone-count and item-count chip, so we pull those counts in one nested query
// (milestone count = array length; item count = sum of each milestone's item count)
// and fold them down to plain numbers here. Ordered by the admin's arrangement.
export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const { data, error } = await locals.supabase
		.from('templates')
		.select(
			'id, name, icon, description, position, created_at, updated_at, template_milestones(id, template_items(count))'
		)
		.order('position', { ascending: true });

	if (error) {
		console.error('[templates] list fetch failed:', error);
		return json({ message: 'Could not load templates.' }, { status: 500 });
	}

	const templates = (data ?? []).map((t) => {
		const milestones = t.template_milestones ?? [];
		const itemCount = milestones.reduce((sum, m) => sum + (m.template_items?.[0]?.count ?? 0), 0);
		return {
			id: t.id,
			name: t.name,
			icon: t.icon,
			description: t.description,
			position: t.position,
			created_at: t.created_at,
			updated_at: t.updated_at,
			milestoneCount: milestones.length,
			itemCount
		};
	});

	return json({ templates });
};

// Create an empty template. Admin-only. RLS on `templates` forces admin_id =
// auth.uid(), so ownership is enforced in the database regardless of what we send —
// we still set it explicitly to satisfy the WITH CHECK policy. New templates start
// at the end of the grid (position = max + 1).
const createSchema = z.object({
	name: z.string().trim().min(1, 'A template name is required.').max(120),
	icon: z.string().trim().min(1).max(80).optional(),
	description: z.string().trim().max(500).nullable().optional()
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
	const { name, icon, description } = parsed.data;

	// Next position = highest existing position + 1 (0 for the first template).
	const { data: last, error: posError } = await locals.supabase
		.from('templates')
		.select('position')
		.order('position', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (posError) {
		console.error('[templates] position lookup failed:', posError);
		return json({ message: 'Could not create the template. Please try again.' }, { status: 500 });
	}
	const position = (last?.position ?? -1) + 1;

	const { data, error } = await locals.supabase
		.from('templates')
		.insert({
			admin_id: locals.user.id,
			name,
			icon: icon || 'ri-file-list-3-line',
			description: description || null,
			position
		})
		.select('id, name, icon, description, position, created_at, updated_at')
		.single();

	if (error) {
		console.error('[templates] create failed:', error);
		return json({ message: 'Could not create the template. Please try again.' }, { status: 500 });
	}

	return json({ template: { ...data, milestoneCount: 0, itemCount: 0 } }, { status: 201 });
};
