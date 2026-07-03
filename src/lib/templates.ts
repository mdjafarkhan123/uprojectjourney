// Project templates are seed data, not a runtime table (see data-model.md).
// Choosing a template at creation copies DEFAULT_MILESTONES into the project's
// own milestones; after that the project is fully independent of the template.
// These are plain constants (no secrets), so they're shared by the create page
// (labels for the picker) and the API route (validation + seeding).

export const PROJECT_TEMPLATES = [
	{ key: 'wordpress_business', label: 'WordPress Business' },
	{ key: 'woocommerce_store', label: 'WooCommerce Store' },
	{ key: 'landing_page', label: 'Landing Page' },
	{ key: 'website_redesign', label: 'Website Redesign' },
	{ key: 'custom', label: 'Custom' }
] as const;

export type TemplateKey = (typeof PROJECT_TEMPLATES)[number]['key'];

// Non-empty tuple for z.enum(...).
export const TEMPLATE_KEYS = PROJECT_TEMPLATES.map((t) => t.key) as [TemplateKey, ...TemplateKey[]];

export function templateLabel(key: TemplateKey): string {
	return PROJECT_TEMPLATES.find((t) => t.key === key)?.label ?? key;
}

// Every template seeds the same five ordered phases in V1.
export const DEFAULT_MILESTONES = [
	'Planning',
	'Design',
	'Development',
	'Testing',
	'Launch'
] as const;

/** The rows to insert into `milestones` when a project is created. */
export function seedMilestones(projectId: string) {
	return DEFAULT_MILESTONES.map((name, position) => ({
		project_id: projectId,
		name,
		position
	}));
}
