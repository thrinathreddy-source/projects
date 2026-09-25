/**
 * Maps each Pulse category to real-world keywords worth searching
 * OppIDX's own Opportunity board for — the first real edge in "the graph"
 * (Policy → Opportunities), crossing from Pulse into the Opportunities
 * room using data that already exists on both sides (no new tagging work,
 * no ML). Deliberately narrow keyword lists: a category with nothing
 * genuinely relevant should show nothing, not a stretched match — same
 * "leave it blank rather than fake it" rule the rest of the site follows.
 */
export const PULSE_OPPORTUNITY_KEYWORDS: Record<string, string[]> = {
  "Health & Sanitation": ["health", "medical", "hospital", "sanitation", "public health"],
  "Education & Skilling": ["education", "scholarship", "skill", "school", "university"],
  "Women & Child Welfare": ["women", "gender", "child", "minority"],
  "Rural Development": ["rural", "panchayat", "village"],
  "Agriculture": ["agriculture", "agri", "farmer", "farming", "crop"],
  "Environment & Cleanliness": ["environment", "climate", "sustainab", "pollution", "renewable"],
  "Infrastructure": ["civil engineering", "highway", "railway", "road construction", "PMGSY", "NHAI"],
  "Governance & Welfare Schemes": ["public policy", "government-job", "state-scheme", "psu", "civil service", "UPSC", "policy fellowship"],
  "Markets & Business": ["startup", "business", "finance", "funding", "accelerator", "economy"],
  "National Development": ["development", "india", "public policy"],
}
