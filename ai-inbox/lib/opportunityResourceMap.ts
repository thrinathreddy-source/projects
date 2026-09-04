/**
 * Maps an opportunity's audience/tags to real Resource categories worth
 * surfacing on its detail page — the second graph edge (Opportunities →
 * Resources). Checked against actual Resource content before writing this:
 * "Test Prep," "Tools," "Templates & Guides," and "Courses" all turned out
 * to be software-engineering/CS skill-building repos (coding interview
 * prep, dev cheatsheets, free CS courses), not general academic test prep
 * — so they only match tech-tagged opportunities. Only "Financial
 * Literacy" is genuinely general-purpose. An academic-only listing (e.g.
 * a Rhodes-style scholarship with no tech tags) should surface nothing
 * here rather than a stretched match.
 */
export function relatedResourceCategories(opp: { audience: string; tags: string }): string[] {
  const tags = opp.tags.toLowerCase()
  const categories = new Set<string>()

  const isTech = /software engineering|data science|machine learning|data engineering|security engineering|backend|frontend|\bdev\b|computer science/.test(tags)
  if (isTech) {
    categories.add('Test Prep')
    categories.add('Tools')
    categories.add('Courses')
    categories.add('Templates & Guides')
  }

  if (opp.audience === 'FOUNDER' || /startup|funding|accelerator|\bgrant\b/.test(tags)) {
    categories.add('Financial Literacy')
  }

  return [...categories]
}
