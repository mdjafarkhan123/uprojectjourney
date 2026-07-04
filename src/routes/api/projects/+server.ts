import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { seedMilestones, templateLabel, TEMPLATE_KEYS } from '$lib/templates';
import { computeOverallProgress } from '$lib/progress';
import { deriveProjectStatus } from '$lib/portal/journey';

// Shape returned to the list page. Progress is DERIVED — a weighted, draft-aware
// blend of milestone progress (see $lib/progress), never stored on the project.
type ProjectListItem = {
	id: string;
	name: string;
	client_name: string;
	status: string;
	progress: number;
	created_at: string;
	public_slug: string | null;
	is_public: boolean;
};

type RollupMilestone = {
	status: 'not_started' | 'open' | 'in_progress' | 'completed';
	progress: number;
	weight: number;
	scope_finalized: boolean;
	timeline_updates: { status: string }[];
};

// List this admin's projects. Reads go through the RLS-enforced client, so rows
// are already scoped to the caller. `projects` has two FKs to `users`, so the
// client embed is disambiguated by the FK name.
export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const { data, error } = await locals.supabase
		.from('projects')
		.select(
			'id, name, created_at, public_slug, is_public, client:users!projects_client_id_fkey(full_name), milestones(status, progress, weight, scope_finalized, timeline_updates(status))'
		)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('[projects] list fetch failed:', error);
		return json({ message: 'Could not load projects.' }, { status: 500 });
	}

	const projects: ProjectListItem[] = (data ?? []).map((row) => {
		const milestones = (row.milestones as RollupMilestone[] | null) ?? [];
		return {
			id: row.id,
			name: row.name,
			// Embedded to-one relation comes back as an object (or null if RLS-hidden).
			client_name: (row.client as { full_name: string } | null)?.full_name ?? '—',
			// Auto-derived from milestones + timeline signals — the stored column is ignored.
			status: deriveProjectStatus(milestones),
			progress: computeOverallProgress(milestones),
			created_at: row.created_at,
			public_slug: row.public_slug,
			is_public: row.is_public
		};
	});

	return json({ projects });
};

// Create a project from a template. Admin-only. RLS on `projects` forces
// admin_id = auth.uid(). We verify the client belongs to this admin via the
// RLS-scoped client (defence in depth — the picker only lists own clients).
// No single transaction is available over the API, so on milestone-seed failure
// we compensate by deleting the just-created project to avoid orphans.
const createSchema = z.object({
	name: z.string().trim().min(1, 'Project name is required.').max(120),
	clientId: z.uuid('Choose a client.'),
	templateKey: z.enum(TEMPLATE_KEYS, { message: 'Choose a template.' }),
	// Optional manual creation date (ISO "yyyy-mm-dd"). Omitted → DB default now().
	createdAt: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
		.refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), 'Enter a valid date.')
		.optional()
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
	const { name, clientId, templateKey, createdAt } = parsed.data;

	// Confirm the client is one this admin owns (RLS hides other admins' users).
	const { data: client, error: clientError } = await locals.supabase
		.from('users')
		.select('id, full_name')
		.eq('id', clientId)
		.eq('role', 'client')
		.maybeSingle();

	if (clientError) {
		console.error('[projects] client lookup failed:', clientError);
		return json({ message: 'Could not create the project. Please try again.' }, { status: 500 });
	}
	if (!client) {
		return json(
			{
				message: 'That client was not found.',
				errors: { clientId: ['That client was not found.'] }
			},
			{ status: 400 }
		);
	}

	// 1. Insert the project (RLS enforces admin_id = auth.uid()).
	const { data: project, error: projectError } = await locals.supabase
		.from('projects')
		.insert({
			admin_id: locals.user.id,
			client_id: clientId,
			name,
			status: 'planning',
			template_key: templateKey,
			project_type: templateLabel(templateKey),
			// Only override the DB default when the admin picked a date.
			...(createdAt ? { created_at: createdAt } : {})
		})
		.select('id, name, status, created_at')
		.single();

	if (projectError || !project) {
		console.error('[projects] create failed:', projectError);
		return json({ message: 'Could not create the project. Please try again.' }, { status: 500 });
	}

	// 2. Seed the template's milestones. If this fails, compensate by deleting
	//    the project so we never leave a project with no milestones.
	const { error: milestonesError } = await locals.supabase
		.from('milestones')
		.insert(seedMilestones(project.id));

	if (milestonesError) {
		console.error('[projects] milestone seed failed, rolling back project:', milestonesError);
		const { error: rollbackError } = await locals.supabase
			.from('projects')
			.delete()
			.eq('id', project.id);
		if (rollbackError) {
			console.error('[projects] rollback delete failed:', rollbackError);
		}
		return json({ message: 'Could not create the project. Please try again.' }, { status: 500 });
	}

	// Freshly seeded milestones are all progress=0, so derived progress is 0.
	const created: ProjectListItem = {
		id: project.id,
		name: project.name,
		client_name: client.full_name,
		status: project.status,
		progress: 0,
		created_at: project.created_at,
		public_slug: null,
		is_public: false
	};

	return json({ project: created }, { status: 201 });
};
