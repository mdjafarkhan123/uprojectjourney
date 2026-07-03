import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// Bulk-set every milestone's weight for one project in a single request.
//
// Weight is a milestone's PERCENTAGE share of the project total, so the values
// must cover every milestone in the project and add up to exactly 100. Enforcing
// that here (server-side) is the real guard — the editor UI mirrors it, but a
// client can never persist a broken split (90%, 110%, a subset of milestones…).
//
// Admin-only. RLS on `milestones` allows the write only when the parent project
// belongs to this admin, so ownership needs no extra check; we still verify the
// submitted id set matches the project's milestones exactly so a partial payload
// can't slip through at 100%.
const bodySchema = z.object({
	weights: z
		.array(
			z.object({
				id: z.uuid(),
				weight: z.number().int('Use whole percentages.').min(0).max(100)
			})
		)
		.min(1, 'Nothing to update.')
});

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const projectId = params.id ?? '';
	if (!z.uuid().safeParse(projectId).success) {
		return json({ message: 'Invalid project id.' }, { status: 400 });
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ message: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{
				message: 'Please check the weights and try again.',
				errors: z.flattenError(parsed.error).fieldErrors
			},
			{ status: 400 }
		);
	}
	const { weights } = parsed.data;

	// No duplicate milestone ids in the payload.
	const submittedIds = new Set(weights.map((w) => w.id));
	if (submittedIds.size !== weights.length) {
		return json({ message: 'A milestone was listed more than once.' }, { status: 400 });
	}

	// Must add up to exactly 100 across the whole project.
	const total = weights.reduce((sum, w) => sum + w.weight, 0);
	if (total !== 100) {
		return json(
			{ message: `Weights must total 100% — they currently total ${total}%.` },
			{ status: 400 }
		);
	}

	// The payload must describe every milestone in this project (no more, no fewer),
	// so a 100% split can't be saved while ignoring some milestones.
	const { data: existing, error: fetchError } = await locals.supabase
		.from('milestones')
		.select('id')
		.eq('project_id', projectId);

	if (fetchError) {
		console.error('[weights] load milestones failed:', fetchError);
		return json({ message: 'Could not update the weights. Please try again.' }, { status: 500 });
	}
	const projectIds = new Set((existing ?? []).map((m) => m.id));
	if (
		projectIds.size !== submittedIds.size ||
		![...submittedIds].every((id) => projectIds.has(id))
	) {
		return json(
			{ message: 'The milestone list is out of date. Please refresh and try again.' },
			{ status: 409 }
		);
	}

	// Apply each weight. RLS scopes every write to this admin's project.
	const results = await Promise.all(
		weights.map((w) =>
			locals.supabase!.from('milestones').update({ weight: w.weight }).eq('id', w.id)
		)
	);
	const failed = results.find((r) => r.error);
	if (failed?.error) {
		console.error('[weights] update failed:', failed.error);
		return json({ message: 'Could not update the weights. Please try again.' }, { status: 500 });
	}

	return json({ weights: weights.map((w) => ({ id: w.id, weight: w.weight })) });
};
