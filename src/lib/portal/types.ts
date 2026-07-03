// Shape of the client-facing portal read (`GET /api/portal/projects`). Read-only;
// the portal never mutates these. Mirrors the admin project detail shape minus the
// admin-only fields, so both views agree on the journey structure.

export type ProjectStatus =
	'planning' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';

export type MilestoneStatus = 'not_started' | 'open' | 'in_progress' | 'completed';

export type TimelineStatus =
	'not_started' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';

export type TimelineUpdate = {
	id: string;
	title: string;
	description: string | null;
	status: TimelineStatus;
	required_action: string | null;
	entry_date: string;
	created_at: string;
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
	// Most recent activity in this phase — bumped by any edit to the milestone or any
	// of its work items (see the updated_at triggers). Drives the portal's "Updated" line.
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
	branding: PublicBranding | null;
};
