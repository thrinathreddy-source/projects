/**
 * Real counts from our offline, in-person campus outreach (school/college
 * subscription drives) — the same product, sold in person instead of
 * through the website. These are genuine, not estimates, so we add them on
 * top of the live database counts rather than starting the public numbers
 * over at zero just because the channel wasn't the website. Disclosed at
 * /terms so nobody mistakes this for a website-only figure.
 *
 * Snapshot taken 2026-07: bump these by hand when a new offline run reports
 * a fresh total — they don't move on their own like the DB-backed counts do.
 */
export const OFFLINE_SUBSCRIBER_BASELINE = 608

/**
 * People who saw the offline subscription pitch in person — a genuine
 * headcount, not a page-view count. Added as the starting point for the
 * public "Opportunity Viewers" figure, with the live online view count
 * (see trackView / opportunity viewCount) added on top of it — same
 * baseline-plus-live pattern as OFFLINE_SUBSCRIBER_BASELINE. Disclosed at
 * /terms so nobody mistakes the combined number for website-only traffic.
 */
export const OFFLINE_VIEWER_BASELINE = 4500
