import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// The admin's branding is a single row keyed by admin_id (PK). Reads and writes
// go through the RLS-enforced client, so an admin can only ever see or touch
// their own row. The client portal later reads this row (via its own SELECT
// policy) to adopt the admin's brand color.

// Return the admin's branding row, or null if they haven't set one yet.
export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const { data, error } = await locals.supabase
		.from('admin_branding')
		.select('admin_id, company_name, logo_url, primary_color, updated_at')
		.maybeSingle();

	if (error) {
		console.error('[branding] fetch failed:', error);
		return json({ message: 'Could not load your branding.' }, { status: 500 });
	}

	return json({ branding: data });
};

// All three fields are optional and may be blank — a blank value clears that
// field (stored as null). The form always sends the full set, so this is an
// idempotent replace of the singleton, hence PUT.
const HEX = /^#[0-9a-fA-F]{6}$/;
const brandingSchema = z.object({
	companyName: z.string().trim().max(120, 'Keep the company name under 120 characters.'),
	logoUrl: z
		.string()
		.trim()
		.max(2048, 'That URL is too long.')
		.refine(
			(v) => v === '' || /^https?:\/\//i.test(v),
			'Enter a full URL starting with http:// or https://'
		),
	primaryColor: z
		.string()
		.trim()
		.refine((v) => v === '' || HEX.test(v), 'Use a 6-digit hex color like #2563eb')
});

export const PUT: RequestHandler = async ({ request, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = brandingSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				message: 'Please check the form and try again.',
				errors: z.flattenError(parsed.error).fieldErrors
			},
			{ status: 400 }
		);
	}
	const { companyName, logoUrl, primaryColor } = parsed.data;

	// Upsert the singleton. admin_id is forced to the caller so RLS's WITH CHECK
	// (admin_id = auth.uid()) is always satisfied — a client can't write another
	// admin's row even if they spoof the body. Blank fields are stored as null.
	const { data, error } = await locals.supabase
		.from('admin_branding')
		.upsert(
			{
				admin_id: locals.user.id,
				company_name: companyName === '' ? null : companyName,
				logo_url: logoUrl === '' ? null : logoUrl,
				primary_color: primaryColor === '' ? null : primaryColor,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'admin_id' }
		)
		.select('admin_id, company_name, logo_url, primary_color, updated_at')
		.single();

	if (error) {
		console.error('[branding] save failed:', error);
		return json({ message: 'Could not save your branding. Please try again.' }, { status: 500 });
	}

	return json({ branding: data });
};
