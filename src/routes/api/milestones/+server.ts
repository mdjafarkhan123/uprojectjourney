import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// Create a milestone under a project. Admin-only. RLS on `milestones` allows the
// insert only when the parent project belongs to this admin; we also verify
// ownership here so a bad/foreign project id returns a clean 404 instead of an
// RLS failure. New milestones start at the end of the list (position = max + 1),
// status `not_started`, progress 0.
const createSchema = z.object({
	projectId: z.uuid(),
	name: z.string().trim().min(1, 'Milestone name is required.').max(120),
	startDate: z.iso.date().nullable().optional(),
	expectedCompletionDate: z.iso.date().nullable().optional(),
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
	const { projectId, name, startDate, expectedCompletionDate, overview } = parsed.data;

	// Confirm the project is visible to this admin (defence in depth over RLS).
	const { data: project, error: projectError } = await locals.supabase
		.from('projects')
		.select('id')
		.eq('id', projectId)
		.maybeSingle();

	if (projectError) {
		console.error('[milestones] project lookup failed:', projectError);
		return json({ message: 'Could not add the milestone. Please try again.' }, { status: 500 });
	}
	if (!project) {
		return json({ message: 'Project not found.' }, { status: 404 });
	}

	// Next position = highest existing position + 1 (0 for the first milestone).
	const { data: last, error: posError } = await locals.supabase
		.from('milestones')
		.select('position')
		.eq('project_id', projectId)
		.order('position', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (posError) {
		console.error('[milestones] position lookup failed:', posError);
		return json({ message: 'Could not add the milestone. Please try again.' }, { status: 500 });
	}
	const position = (last?.position ?? -1) + 1;

	const { data, error } = await locals.supabase
		.from('milestones')
		.insert({
			project_id: projectId,
			name,
			status: 'not_started',
			progress: 0,
			position,
			start_date: startDate ?? null,
			expected_completion_date: expectedCompletionDate ?? null,
			overview: overview || null
		})
		.select(
			'id, name, status, progress, weight, scope_finalized, position, start_date, expected_completion_date, overview'
		)
		.single();

	if (error) {
		console.error('[milestones] create failed:', error);
		return json({ message: 'Could not add the milestone. Please try again.' }, { status: 500 });
	}

	return json({ milestone: data }, { status: 201 });
};
