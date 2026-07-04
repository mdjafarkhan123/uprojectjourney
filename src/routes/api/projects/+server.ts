import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { computeOverallProgress, computeMilestoneProgress } from '$lib/progress';
import { deriveMilestoneStatus } from '$lib/server/milestone-status';
import { deriveProjectStatus } from '$lib/portal/journey';
import { slugFormatValid } from '$lib/slug';

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
// The template is one of this admin's own library templates (RLS-scoped); its
// milestones + items are deep-copied (SNAPSHOT) into the project's own
// `milestones` + `timeline_updates` — editing the template later never touches
// existing projects. No single transaction is available over the API, so on any
// seed failure we compensate by deleting the just-created project to avoid
// orphans (its milestones + items cascade away with it).
const createSchema = z
	.object({
		name: z.string().trim().min(1, 'Project name is required.').max(120),
		clientId: z.uuid('Choose a client.'),
		templateId: z.uuid('Choose a template.'),
		// Optional manual creation date (ISO "yyyy-mm-dd"). Omitted → DB default now().
		createdAt: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')
			.refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), 'Enter a valid date.')
			.optional(),
		// Optional delivery date ("yyyy-mm-dd"). Omitted → no delivery date set.
		expectedDeliveryDate: z.iso.date().nullable().optional(),
		// Optional public sharing, mirroring the Edit-project flow. An empty slug means
		// "no public link yet"; a non-empty slug must pass the format rules. The unique
		// (admin_id, public_slug) index is the authoritative guard at insert time.
		isPublic: z.boolean().optional(),
		publicSlug: z
			.string()
			.trim()
			.toLowerCase()
			.refine(
				(s) => s === '' || slugFormatValid(s),
				'Use 3–40 lowercase letters, numbers and hyphens.'
			)
			.optional()
	})
	// Can't switch public on without a valid link to share.
	.refine(
		(o) => !o.isPublic || (typeof o.publicSlug === 'string' && slugFormatValid(o.publicSlug)),
		{
			message: 'Add a valid public link to turn on public sharing.',
			path: ['publicSlug']
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
	const { name, clientId, templateId, createdAt, expectedDeliveryDate, isPublic, publicSlug } =
		parsed.data;
	const slug = publicSlug ? publicSlug : null;

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

	// Load the chosen template's full milestone → item tree. RLS scopes this to the
	// admin's own templates, so an unknown/foreign id simply returns no row → clean
	// error. We read this BEFORE creating the project so a bad template id fails fast
	// without leaving anything to roll back.
	const { data: template, error: templateError } = await locals.supabase
		.from('templates')
		.select(
			'id, name, template_milestones(name, weight, overview, position, template_items(title, description, default_status, position))'
		)
		.eq('id', templateId)
		.maybeSingle();

	if (templateError) {
		console.error('[projects] template lookup failed:', templateError);
		return json({ message: 'Could not create the project. Please try again.' }, { status: 500 });
	}
	if (!template) {
		return json(
			{
				message: 'That template was not found.',
				errors: { templateId: ['That template was not found.'] }
			},
			{ status: 400 }
		);
	}

	// 1. Insert the project (RLS enforces admin_id = auth.uid()). We keep the
	//    reference columns filled: template_key stores the source template id and
	//    project_type its name (both are free-text reference only — the project is a
	//    snapshot, not a live link).
	const { data: project, error: projectError } = await locals.supabase
		.from('projects')
		.insert({
			admin_id: locals.user.id,
			client_id: clientId,
			name,
			status: 'planning',
			template_key: template.id,
			project_type: template.name,
			public_slug: slug,
			is_public: !!isPublic,
			// Optional delivery date; left null when not provided.
			expected_delivery_date: expectedDeliveryDate ?? null,
			// Only override the DB default when the admin picked a date.
			...(createdAt ? { created_at: createdAt } : {})
		})
		.select('id, name, status, created_at, public_slug, is_public')
		.single();

	if (projectError || !project) {
		// A duplicate public slug for this admin trips the unique index — surface it
		// as a clean field error rather than a generic 500.
		if (projectError?.code === '23505') {
			return json(
				{
					message: 'That public link is already taken.',
					errors: { publicSlug: ['That link is already taken. Try another.'] }
				},
				{ status: 409 }
			);
		}
		console.error('[projects] create failed:', projectError);
		return json({ message: 'Could not create the project. Please try again.' }, { status: 500 });
	}

	// Every seeded work item and milestone start date is stamped with the project's
	// creation date (keeps timeline_updates.entry_date NOT NULL without a picker).
	const entryDate = createdAt ?? project.created_at.slice(0, 10);

	// Rolls the just-created project back on any seed failure, so we never leave a
	// half-seeded project. Milestones + timeline items cascade away with it.
	async function rollback(reason: string, err: unknown) {
		console.error(`[projects] ${reason}, rolling back project:`, err);
		const { error: rollbackError } = await locals
			.supabase!.from('projects')
			.delete()
			.eq('id', project!.id);
		if (rollbackError) {
			console.error('[projects] rollback delete failed:', rollbackError);
		}
	}

	// 2. Deep-copy the template's milestones into the project's own milestones.
	//    Positions are re-issued 0..n by template order (unique per project), so we
	//    can match each inserted row back to its source by position. Each milestone's
	//    status/progress/start_date is derived from its default item statuses, exactly
	//    as the sync logic would compute after seeding.
	const sortedMilestones = [...(template.template_milestones ?? [])].sort(
		(a, b) => a.position - b.position
	);

	if (sortedMilestones.length > 0) {
		// Weight is each milestone's PERCENT share of the project — the editor enforces
		// a whole-number split summing to exactly 100. Seed that same 100-split evenly
		// (remainder handed to the first milestones) so a fresh project starts balanced
		// and never trips the "weights don't total 100%" nudge. (The template's own
		// weight is ignored here; it defaults to 1 and isn't a percentage.)
		const milestoneCount = sortedMilestones.length;
		const baseWeight = Math.floor(100 / milestoneCount);
		const weightRemainder = 100 - baseWeight * milestoneCount;
		const milestoneRows = sortedMilestones.map((m, i) => {
			const itemStatuses = (m.template_items ?? []).map((it) => it.default_status);
			return {
				project_id: project.id,
				name: m.name,
				position: i,
				weight: baseWeight + (i < weightRemainder ? 1 : 0),
				overview: m.overview,
				scope_finalized: false,
				status: deriveMilestoneStatus(itemStatuses, false),
				progress: computeMilestoneProgress(itemStatuses),
				start_date: itemStatuses.length > 0 ? entryDate : null
			};
		});

		const { data: insertedMilestones, error: milestonesError } = await locals.supabase
			.from('milestones')
			.insert(milestoneRows)
			.select('id, position');

		if (milestonesError || !insertedMilestones) {
			await rollback('milestone seed failed', milestonesError);
			return json({ message: 'Could not create the project. Please try again.' }, { status: 500 });
		}

		// Map re-issued position → new milestone id, then flatten every template item
		// into a timeline_update under its milestone (snapshot of title/description/
		// default status), inserted in one batch.
		const idByPosition = new Map(insertedMilestones.map((row) => [row.position, row.id]));
		// Every seeded item shares one entry_date (the project date), so the timeline's
		// only tiebreak is created_at. A single batch insert would stamp them all with an
		// identical created_at, leaving the order undefined — which is how the admin and
		// client views ended up disagreeing. Give each item a distinct, increasing
		// created_at in template order so every view sorts them identically, top-first.
		const seedBase = Date.now();
		let seedOffset = 0;
		const timelineRows = sortedMilestones.flatMap((m, i) => {
			const milestoneId = idByPosition.get(i);
			if (!milestoneId) return [];
			return [...(m.template_items ?? [])]
				.sort((a, b) => a.position - b.position)
				.map((it) => ({
					milestone_id: milestoneId,
					title: it.title,
					description: it.description,
					status: it.default_status,
					required_action: null,
					entry_date: entryDate,
					created_at: new Date(seedBase + seedOffset++).toISOString()
				}));
		});

		if (timelineRows.length > 0) {
			const { error: timelineError } = await locals.supabase
				.from('timeline_updates')
				.insert(timelineRows);

			if (timelineError) {
				await rollback('timeline seed failed', timelineError);
				return json(
					{ message: 'Could not create the project. Please try again.' },
					{ status: 500 }
				);
			}
		}
	}

	// Seeded milestones are all in Draft (scope_finalized=false), so each contributes
	// 0 to the weighted overall — a freshly created project always shows 0% progress.
	const created: ProjectListItem = {
		id: project.id,
		name: project.name,
		client_name: client.full_name,
		status: project.status,
		progress: 0,
		created_at: project.created_at,
		public_slug: project.public_slug,
		is_public: project.is_public
	};

	return json({ project: created }, { status: 201 });
};
