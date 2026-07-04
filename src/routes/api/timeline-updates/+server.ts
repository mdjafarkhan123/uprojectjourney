import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { syncMilestone } from '$lib/server/milestone-status';

// Create a timeline update inside a milestone. Admin-only; RLS on
// `timeline_updates` allows the insert only when the parent milestone's project
// belongs to this admin, so no service-role client is needed. We still verify the
// milestone is visible first (defence in depth + a clean 404 instead of a raw RLS
// failure). `required_action` is REQUIRED when status is `waiting_for_client`
// (business rule: the client must always know why progress paused).
const timelineStatuses = [
	'not_started',
	'in_progress',
	'waiting_for_client',
	'under_review',
	'completed'
] as const;

// A "Live preview" link: a labelled http(s) URL. We validate the protocol with the
// URL parser (not a regex) so only real web links get through.
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

// Cap the number of links per update — a sane guard, not a product limit.
const linksSchema = z.array(linkSchema).max(20).optional();

const createSchema = z
	.object({
		milestoneId: z.uuid(),
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
	const input = parsed.data;

	// Confirm the parent milestone is visible to this admin under RLS.
	const { data: milestone, error: lookupError } = await locals.supabase
		.from('milestones')
		.select('id, scope_finalized')
		.eq('id', input.milestoneId)
		.maybeSingle();

	if (lookupError) {
		console.error('[timeline-updates] milestone lookup failed:', lookupError);
		return json({ message: 'Could not add the update. Please try again.' }, { status: 500 });
	}
	if (!milestone) {
		return json({ message: 'Milestone not found.' }, { status: 404 });
	}

	// Scope lock: no new items once the milestone's scope is finalized. The admin
	// must click "Edit Scope" (draft mode) before changing the checklist.
	if (milestone.scope_finalized) {
		return json(
			{ message: 'This milestone is finalized. Click Edit Scope to add items.' },
			{ status: 409 }
		);
	}

	const { data, error } = await locals.supabase
		.from('timeline_updates')
		.insert({
			milestone_id: input.milestoneId,
			title: input.title,
			description: input.description || null,
			status: input.status,
			required_action: input.status === 'waiting_for_client' ? input.requiredAction || null : null,
			entry_date: input.entryDate
		})
		.select('id, title, description, status, required_action, entry_date, created_at')
		.single();

	if (error) {
		console.error('[timeline-updates] insert failed:', error);
		return json({ message: 'Could not add the update. Please try again.' }, { status: 500 });
	}

	// Attach any "Live preview" links. Insert in order so `position` matches the
	// order the admin arranged them; RLS ties each row back to this admin's project.
	let links: { id: string; url: string; label: string; position: number }[] = [];
	if (input.links && input.links.length > 0) {
		const { data: linkRows, error: linkError } = await locals.supabase
			.from('timeline_update_links')
			.insert(
				input.links.map((l, i) => ({
					update_id: data.id,
					url: l.url,
					label: l.label,
					position: i
				}))
			)
			.select('id, url, label, position');
		if (linkError) {
			console.error('[timeline-updates] link insert failed:', linkError);
			return json({ message: 'Could not save the links. Please try again.' }, { status: 500 });
		}
		links = linkRows ?? [];
	}

	// Re-derive the parent milestone's status + progress from its items (adding the
	// first item moves a `not_started` milestone to `open`; progress = completed /
	// total). Returned so the client can patch the milestone badge + bar instantly.
	let milestoneStatus: string | null = null;
	let milestoneProgress: number | null = null;
	let milestoneStartDate: string | null = null;
	try {
		const synced = await syncMilestone(locals.supabase, input.milestoneId);
		milestoneStatus = synced?.status ?? null;
		milestoneProgress = synced?.progress ?? null;
		milestoneStartDate = synced?.startDate ?? null;
	} catch (syncError) {
		console.error('[timeline-updates] milestone sync failed:', syncError);
	}

	return json(
		{ update: { ...data, links }, milestoneStatus, milestoneProgress, milestoneStartDate },
		{ status: 201 }
	);
};
