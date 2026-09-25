/**
 * Shared between the /contact form and its API route. Lives in its own module
 * so the client page can import it without pulling the route handler — and
 * with it supabaseAdmin, the service-role key, and the mailer — into the
 * browser bundle.
 */
// The designated Grievance Officer, published as the IT Rules 2021 require.
// Named in one place so the terms page and the contact form can't drift.
export const GRIEVANCE_OFFICER = "MVBR";

export const GRIEVANCE_CATEGORIES = [
  "Report abuse or a safety concern",
  "Grievance or complaint",
  "Delete my account",
  "Correct or export my data",
  "Something is broken",
  "Something else",
] as const;

export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number];
