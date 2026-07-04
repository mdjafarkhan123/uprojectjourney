import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// Deep-copy a template — its milestones and every item under them — into a brand-new
// template owned by this admin. Admin-only; every read and write goes through the
// RLS-enforced client, so the source must be one of this admin's own templates (an
// unknown/foreign id reads back nothing → clean 404) and each insert is force-scoped
// to the caller. The copy lands at the end of the grid, named "<name> (Copy)".
export const POST: RequestHandler = async ({ params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid template id.' }, { status: 400 });
	}

	// Read the source tree (milestones + items) in one query, scoped by RLS.
	const { data: source, error: sourceError } = await locals.supabase
		.from('templates')
		.select(
			'id, name, icon, description, template_milestones(id, name, weight, overview, position, template_items(title, description, default_status, position))'
		)
		.eq('id', id)
		.maybeSingle();

	if (sourceError) {
		console.error('[templates] duplicate source fetch failed:', sourceError);
		return json(
			{ message: 'Could not duplicate the template. Please try again.' },
			{ status: 500 }
		);
	}
	if (!source) {
		return json({ message: 'Template not found.' }, { status: 404 });
	}

	// New template goes at the end of the grid.
	const { data: last, error: posError } = await locals.supabase
		.from('templates')
		.select('position')
		.order('position', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (posError) {
		console.error('[templates] duplicate position lookup failed:', posError);
		return json(
			{ message: 'Could not duplicate the template. Please try again.' },
			{ status: 500 }
		);
	}
	const position = (last?.position ?? -1) + 1;

	const { data: newTemplate, error: templateError } = await locals.supabase
		.from('templates')
		.insert({
			admin_id: locals.user.id,
			name: `${source.name} (Copy)`,
			icon: source.icon,
			description: source.description,
			position
		})
		.select('id, name, icon, description, position, created_at, updated_at')
		.single();

	if (templateError) {
		console.error('[templates] duplicate template insert failed:', templateError);
		return json(
			{ message: 'Could not duplicate the template. Please try again.' },
			{ status: 500 }
		);
	}

	const sourceMilestones = source.template_milestones ?? [];

	// Copy milestones, keeping their positions. We insert them, then map each new
	// milestone id back to its source milestone by position so items can be re-parented.
	let milestoneCount = 0;
	let itemCount = 0;
	if (sourceMilestones.length > 0) {
		const { data: newMilestones, error: milestoneError } = await locals.supabase
			.from('template_milestones')
			.insert(
				sourceMilestones.map((m) => ({
					template_id: newTemplate.id,
					name: m.name,
					weight: m.weight,
					overview: m.overview,
					position: m.position
				}))
			)
			.select('id, position');

		if (milestoneError) {
			console.error('[templates] duplicate milestone insert failed:', milestoneError);
			// Roll back the orphaned template so a failed copy leaves nothing behind.
			await locals.supabase.from('templates').delete().eq('id', newTemplate.id);
			return json(
				{ message: 'Could not duplicate the template. Please try again.' },
				{ status: 500 }
			);
		}
		milestoneCount = newMilestones.length;

		const newMilestoneIdByPosition = new Map(newMilestones.map((m) => [m.position, m.id]));

		const itemRows = sourceMilestones.flatMap((m) =>
			(m.template_items ?? []).map((it) => ({
				template_milestone_id: newMilestoneIdByPosition.get(m.position)!,
				title: it.title,
				description: it.description,
				default_status: it.default_status,
				position: it.position
			}))
		);

		if (itemRows.length > 0) {
			const { error: itemError } = await locals.supabase.from('template_items').insert(itemRows);
			if (itemError) {
				console.error('[templates] duplicate item insert failed:', itemError);
				await locals.supabase.from('templates').delete().eq('id', newTemplate.id);
				return json(
					{ message: 'Could not duplicate the template. Please try again.' },
					{ status: 500 }
				);
			}
			itemCount = itemRows.length;
		}
	}

	return json({ template: { ...newTemplate, milestoneCount, itemCount } }, { status: 201 });
};
