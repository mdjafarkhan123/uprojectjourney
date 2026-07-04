// Shape of the client-facing portal read (`GET /api/portal/projects`). Read-only;
// the portal never mutates these. Mirrors the admin project detail shape minus the
// admin-only fields, so both views agree on the journey structure.

export type ProjectStatus =
	'planning' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';

export type MilestoneStatus = 'not_started' | 'open' | 'in_progress' | 'completed';

export type TimelineStatus =
	'not_started' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';

// A "Live preview" link attached to a timeline update — a labelled URL the client
// can open (e.g. a staging site). Zero or more per update.
export type TimelineUpdateLink = {
	id: string;
	url: string;
	label: string;
	position: number;
};

export type TimelineUpdate = {
	id: string;
	title: string;
	description: string | null;
	status: TimelineStatus;
	required_action: string | null;
	entry_date: string;
	created_at: string;
	// Client-facing progress dates. `started_at` is stamped once the item first leaves
	// `not_started` (frozen thereafter); `completed_at` when it becomes `completed`. The
	// client sees these — not the internal `entry_date` — so only real progress shows.
	started_at: string | null;
	completed_at: string | null;
	links: TimelineUpdateLink[];
};

export type Milestone = {
	id: string;
	name: string;
	status: MilestoneStatus;
	progress: number;
	position: number;
	start_date: string | null;
	expected_completion_date: string | null;
	overview: string | null;
	// Most recent client-visible activity in this phase — bumped only when a field the
	// client can see changes on the milestone or one of its work items (see the
	// updated_at triggers). Internal edits (weight, scope lock, reorder, progress cache)
	// don't touch it. Drives the portal's "Updated by {admin name}" line.
	updated_at: string;
	timeline_updates: TimelineUpdate[];
};

export type PortalProject = {
	id: string;
	name: string;
	status: ProjectStatus;
	expected_delivery_date: string | null;
	current_focus_title: string | null;
	current_focus_goal: string | null;
	created_at: string;
	updated_at: string;
	progress: number;
	milestones: Milestone[];
};

// The owning admin's branding, surfaced to the public (login-less) journey so it
// can theme itself the same way the logged-in portal does.
export type PublicBranding = {
	company_name: string | null;
	logo_url: string | null;
	primary_color: string | null;
};

// Shape of the login-less public journey (`get_public_journey` RPC → SSR load).
// Same structure the portal renders, plus the branding needed to theme the bare
// public shell. Note: `required_action` text is stripped server-side for the
// public view, so waiting callouts never leak sensitive asks.
export type PublicJourney = PortalProject & {
	// The owning admin's personal name, shown as "Updated by {name}" on the journey.
	admin_name: string | null;
	branding: PublicBranding | null;
};
