import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { computeOverallProgress } from '$lib/progress';
import { deriveProjectStatus } from '$lib/portal/journey';

// Full project detail + ordered milestones. Progress is DERIVED — a weighted,
// draft-aware blend of milestone progress (see $lib/progress), never stored.
type TimelineStatus =
	'not_started' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';

type TimelineUpdateRow = {
	id: string;
	title: string;
	description: string | null;
	status: TimelineStatus;
	required_action: string | null;
	entry_date: string;
	created_at: string;
};

type MilestoneRow = {
	id: string;
	name: string;
	status: 'not_started' | 'open' | 'in_progress' | 'completed';
	progress: number;
	weight: number;
	scope_finalized: boolean;
	position: number;
	start_date: string | null;
	expected_completion_date: string | null;
	overview: string | null;
	timeline_updates: TimelineUpdateRow[];
};

// Oldest entry first; break same-day ties by creation time so ordering is stable.
function sortTimeline(updates: TimelineUpdateRow[]): TimelineUpdateRow[] {
	return [...updates].sort((a, b) => {
		if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? -1 : 1;
		return a.created_at < b.created_at ? -1 : 1;
	});
}

// Load one project this admin owns, with its milestones ordered by position.
// RLS scopes the row to the caller, so a missing row means "not yours / gone".
export const GET: RequestHandler = async ({ params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid project id.' }, { status: 400 });
	}

	const { data, error } = await locals.supabase
		.from('projects')
		.select(
			'id, name, client_id, status, expected_delivery_date, current_focus_title, current_focus_goal, public_slug, is_public, created_at, updated_at, client:users!projects_client_id_fkey(full_name), milestones(id, name, status, progress, weight, scope_finalized, position, start_date, expected_completion_date, overview, timeline_updates(id, title, description, status, required_action, entry_date, created_at))'
		)
		.eq('id', id)
		.order('position', { referencedTable: 'milestones', ascending: true })
		.maybeSingle();

	if (error) {
		console.error('[projects] detail fetch failed:', error);
		return json({ message: 'Could not load the project.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Project not found.' }, { status: 404 });
	}

	const milestones = ((data.milestones ?? []) as MilestoneRow[]).map((m) => ({
		...m,
		timeline_updates: sortTimeline(m.timeline_updates ?? [])
	}));

	const project = {
		id: data.id,
		name: data.name,
		client_id: data.client_id,
		client_name: (data.client as { full_name: string } | null)?.full_name ?? '—',
		// Auto-derived from milestones + timeline signals — the stored column is ignored.
		status: deriveProjectStatus(milestones),
		expected_delivery_date: data.expected_delivery_date,
		current_focus_title: data.current_focus_title,
		current_focus_goal: data.current_focus_goal,
		public_slug: data.public_slug,
		is_public: data.is_public,
		created_at: data.created_at,
		updated_at: data.updated_at,
		progress: computeOverallProgress(milestones),
		milestones
	};

	return json({ project });
};

// Reserved words a public slug can never be (would collide with real routes).
// Mirrors the DB check constraint `projects_public_slug_format`.
const RESERVED_SLUGS = ['master', 'api', 'p', 'journey'];

// A valid public slug: 3–40 chars, lowercase alnum words joined by single hyphens,
// and not a reserved word. Empty/blank is normalized to null (clears the slug).
const slugString = z
	.string()
	.min(3, 'Use at least 3 characters.')
	.max(40, 'Keep it under 40 characters.')
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only.')
	.refine((s) => !RESERVED_SLUGS.includes(s), 'That word is reserved — pick another.');

// Edit project-level info. Admin-only; RLS restricts the update to the admin's
// own projects. All fields are optional (partial update); at least one required.
const patchSchema = z
	.object({
		name: z.string().trim().min(1, 'Project name is required.').max(120).optional(),
		clientId: z.uuid().optional(),
		// Note: project `status` is not settable — it is auto-derived from milestones
		// on read (see deriveProjectStatus). The stored column is vestigial.
		expectedDeliveryDate: z.iso.date().nullable().optional(),
		// Manual creation date ("yyyy-mm-dd"). Not nullable — a project always has one.
		createdAt: z.iso.date().optional(),
		currentFocusTitle: z.string().trim().max(200).nullable().optional(),
		currentFocusGoal: z.string().trim().max(500).nullable().optional(),
		// Trim + lowercase up front; a blank string means "remove the public link".
		publicSlug: z
			.preprocess((v) => {
				if (typeof v !== 'string') return v;
				const t = v.trim().toLowerCase();
				return t === '' ? null : t;
			}, slugString.nullable())
			.optional(),
		isPublic: z.boolean().optional()
	})
	.refine((obj) => Object.keys(obj).length > 0, { message: 'Nothing to update.' });

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid project id.' }, { status: 400 });
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

	// Can't turn on public sharing while clearing the link in the same request.
	// (The DB enforces "public ⇒ has slug" too; this gives a precise field error.)
	if (input.isPublic === true && input.publicSlug === null) {
		return json(
			{
				message: 'Please check the form and try again.',
				errors: { publicSlug: ['Add a public link before turning on public view.'] }
			},
			{ status: 400 }
		);
	}

	// Reassigning the client: verify the target is one of this admin's clients
	// (RLS on projects only checks the project's admin_id, NOT the new client_id).
	if (input.clientId !== undefined) {
		const { data: client, error: clientError } = await locals.supabase
			.from('users')
			.select('id')
			.eq('id', input.clientId)
			.eq('role', 'client')
			.maybeSingle();

		if (clientError) {
			console.error('[projects] client lookup failed:', clientError);
			return json({ message: 'Could not update the project. Please try again.' }, { status: 500 });
		}
		if (!client) {
			return json(
				{
					message: 'Please check the form and try again.',
					errors: { clientId: ['Pick one of your clients.'] }
				},
				{ status: 400 }
			);
		}
	}

	// Map only the provided fields to DB columns; empty strings on nullable text
	// fields become null so "clear this field" works.
	const update: {
		name?: string;
		client_id?: string;
		expected_delivery_date?: string | null;
		created_at?: string;
		current_focus_title?: string | null;
		current_focus_goal?: string | null;
		public_slug?: string | null;
		is_public?: boolean;
		updated_at: string;
	} = { updated_at: new Date().toISOString() };
	if (input.name !== undefined) update.name = input.name;
	if (input.clientId !== undefined) update.client_id = input.clientId;
	if (input.expectedDeliveryDate !== undefined)
		update.expected_delivery_date = input.expectedDeliveryDate;
	if (input.createdAt !== undefined) update.created_at = input.createdAt;
	if (input.currentFocusTitle !== undefined)
		update.current_focus_title = input.currentFocusTitle || null;
	if (input.currentFocusGoal !== undefined)
		update.current_focus_goal = input.currentFocusGoal || null;
	if (input.publicSlug !== undefined) update.public_slug = input.publicSlug;
	if (input.isPublic !== undefined) update.is_public = input.isPublic;

	const { data, error } = await locals.supabase
		.from('projects')
		.update(update)
		.eq('id', id)
		.select(
			'id, name, client_id, status, expected_delivery_date, created_at, current_focus_title, current_focus_goal, public_slug, is_public, updated_at'
		)
		.maybeSingle();

	if (error) {
		// Unique violation → the slug is taken by another project (possibly another admin's).
		if (error.code === '23505') {
			return json(
				{
					message: 'Please check the form and try again.',
					errors: { publicSlug: ['That link is already taken. Try another.'] }
				},
				{ status: 400 }
			);
		}
		// Check violation → almost always "public requires a slug" (format is caught by Zod first).
		if (error.code === '23514') {
			return json(
				{
					message: 'Please check the form and try again.',
					errors: {
						publicSlug: [
							'Add a public link before turning public view on, and remove it only after turning it off.'
						]
					}
				},
				{ status: 400 }
			);
		}
		console.error('[projects] update failed:', error);
		return json({ message: 'Could not update the project. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Project not found.' }, { status: 404 });
	}

	return json({ project: data });
};

// Permanently delete a project. Admin-only; RLS (`projects_admin_all`) restricts the
// delete to the admin's own projects. Milestones and their timeline updates are
// removed automatically by ON DELETE CASCADE — nothing else references a project.
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid project id.' }, { status: 400 });
	}

	// `.select()` returns the deleted row; a null result means the project was never
	// visible to this admin (not theirs, or already gone) → treat as 404.
	const { data, error } = await locals.supabase
		.from('projects')
		.delete()
		.eq('id', id)
		.select('id')
		.maybeSingle();

	if (error) {
		console.error('[projects] delete failed:', error);
		return json({ message: 'Could not delete the project. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Project not found.' }, { status: 404 });
	}

	return json({ ok: true });
};
