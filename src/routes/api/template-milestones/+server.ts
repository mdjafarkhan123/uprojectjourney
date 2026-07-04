import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// Create a milestone under a template. Admin-only; RLS on `template_milestones`
// allows the insert only when the parent template belongs to this admin. We also
// verify ownership here so a bad/foreign template id returns a clean 404 instead of
// a raw RLS failure. New milestones start at the end of the list (position = max + 1)
// with the default weight of 1.
const createSchema = z.object({
	templateId: z.uuid(),
	name: z.string().trim().min(1, 'A milestone name is required.').max(120),
	weight: z.number().min(0, 'Weight cannot be negative.').max(1000).optional(),
	overview: z.string().trim().max(2000).nullable().optional()
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
	const { templateId, name, weight, overview } = parsed.data;

	// Confirm the parent template is visible to this admin under RLS.
	const { data: template, error: templateError } = await locals.supabase
		.from('templates')
		.select('id')
		.eq('id', templateId)
		.maybeSingle();

	if (templateError) {
		console.error('[template-milestones] template lookup failed:', templateError);
		return json({ message: 'Could not add the milestone. Please try again.' }, { status: 500 });
	}
	if (!template) {
		return json({ message: 'Template not found.' }, { status: 404 });
	}

	// Next position = highest existing position + 1 (0 for the first milestone).
	const { data: last, error: posError } = await locals.supabase
		.from('template_milestones')
		.select('position')
		.eq('template_id', templateId)
		.order('position', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (posError) {
		console.error('[template-milestones] position lookup failed:', posError);
		return json({ message: 'Could not add the milestone. Please try again.' }, { status: 500 });
	}
	const position = (last?.position ?? -1) + 1;

	const { data, error } = await locals.supabase
		.from('template_milestones')
		.insert({
			template_id: templateId,
			name,
			weight: weight ?? 1,
			overview: overview || null,
			position
		})
		.select('id, name, weight, overview, position')
		.single();

	if (error) {
		console.error('[template-milestones] create failed:', error);
		return json({ message: 'Could not add the milestone. Please try again.' }, { status: 500 });
	}

	return json({ milestone: { ...data, items: [] } }, { status: 201 });
};
