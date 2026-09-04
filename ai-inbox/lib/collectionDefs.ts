/**
 * Every /collections/[slug] page — audience-based and topic-based — comes
 * from this one list. Adding a new collection is a config entry here, not a
 * new file: the dynamic route (app/collections/[slug]/page.tsx) renders
 * whichever definition matches the URL.
 *
 * Every `match` predicate was checked against the real, live database before
 * being added here — none of these are guesses. A topic only became a
 * collection if it cleared a real, meaningful listing count (see the
 * comments below); several plausible categories (e.g. a literal
 * "Mechanical Engineering" collection) were deliberately left out because
 * the real tag data doesn't support them as their own category — "hardware
 * engineering"/"hardware"/"robotics" together do (19 real listings), so
 * that's the honest collection that exists instead.
 */
export interface CollectionDef {
  slug: string
  title: string          // H1 on the page
  pageTitle: string       // <title> tag
  description: string     // meta description + subhead copy
  group: 'Audience' | 'Topic' | 'Location' | 'Compensation' | 'Combo'
  icon?: string          // single emoji/symbol shown on the /collections index grid — single-dimension defs only
  // Plain strings, not the app's narrowed Audience/Difficulty unions — this
  // runs against raw Prisma rows before they're cast to the shared type.
  match: (opp: MatchInput) => boolean
}

export interface MatchInput {
  audience: string
  tags: string
  difficulty: string
  location: string | null
  region: string
  country: string
  compType: string | null
}

const tagIncludes = (...keywords: string[]) => (opp: { tags: string }) => {
  const tags = opp.tags.toLowerCase()
  return keywords.some(k => tags.includes(k))
}

export const COLLECTION_DEFS: CollectionDef[] = [
  // ── By audience (existing three, now data-driven like everything else) ──
  {
    slug: 'students',
    icon: '🎒',
    title: 'For students',
    pageTitle: 'Internships, Scholarships & Fellowships for Students — OppIDX',
    description: 'Internships, scholarships, and fellowships — hand-checked, not scraped junk.',
    group: 'Audience',
    match: opp => opp.audience === 'STUDENT',
  },
  {
    slug: 'early-career',
    icon: '💼',
    title: 'For early career',
    pageTitle: 'Early Career Jobs, Internships & Programs — OppIDX',
    description: 'New-grad jobs, early-career programs, and internships — hand-checked, not scraped junk.',
    group: 'Audience',
    match: opp => opp.audience === 'EARLY_CAREER',
  },
  {
    slug: 'founders',
    icon: '🧭',
    title: 'For founders',
    pageTitle: 'Grants, Fellowships & Competitions for Founders — OppIDX',
    description: 'Grants, fellowships, and competitions for founders — hand-checked, not scraped junk.',
    group: 'Audience',
    match: opp => opp.audience === 'FOUNDER',
  },

  // ── By topic (real tag data, ~1,800 verified listings checked) ──
  {
    slug: 'software-engineering',
    icon: '💻',
    title: 'Software engineering opportunities',
    pageTitle: 'Software Engineering Jobs & Internships — OppIDX',
    description: 'Software engineering roles and internships, real and verified — the single largest category on the board.',
    group: 'Topic',
    match: tagIncludes('software engineering'),
  },
  {
    slug: 'ai-and-machine-learning',
    icon: '🤖',
    title: 'AI & machine learning opportunities',
    pageTitle: 'AI & Machine Learning Jobs, Internships & Fellowships — OppIDX',
    description: 'Real AI and machine learning roles, internships, and research positions — verified, not scraped junk.',
    group: 'Topic',
    // "ai" needs a word-boundary check, not tagIncludes' plain substring match —
    // tags are comma-joined with no padding ("internship,ai,paid"), so a bare
    // substring test for " ai " (or "ai-"/"ai/") never matches a real row; \b
    // still matches at the comma boundaries since "," is a non-word character.
    match: opp => {
      const tags = opp.tags.toLowerCase()
      return tags.includes('machine learning') || tags.includes('artificial intelligence') || /\bai\b/.test(tags)
    },
  },
  {
    slug: 'data-science',
    icon: '📊',
    title: 'Data science opportunities',
    pageTitle: 'Data Science Jobs & Internships — OppIDX',
    description: 'Real data science and analytics roles — verified, not scraped junk.',
    group: 'Topic',
    match: tagIncludes('data science'),
  },
  {
    slug: 'scholarships',
    icon: '🎓',
    title: 'Scholarships',
    pageTitle: 'Scholarships — Real, Verified, Free to Search — OppIDX',
    description: 'Real scholarships, hand-checked before they go up — no dead links, no bait.',
    group: 'Topic',
    match: tagIncludes('scholarship'),
  },
  {
    slug: 'fellowships',
    icon: '📜',
    title: 'Fellowships',
    pageTitle: 'Fellowships — Real, Verified, Free to Search — OppIDX',
    description: 'Real fellowships across research, policy, and industry — hand-checked before they go up.',
    group: 'Topic',
    match: tagIncludes('fellowship'),
  },
  {
    slug: 'grants-and-funding',
    icon: '💰',
    title: 'Grants & funding',
    pageTitle: 'Grants & Funding Opportunities — OppIDX',
    description: 'Real grants and funding opportunities for founders, researchers, and students.',
    group: 'Topic',
    match: tagIncludes('grant', 'funding'),
  },
  {
    slug: 'government',
    icon: '🏛',
    title: 'Government opportunities',
    pageTitle: 'Government Jobs & Internships — OppIDX',
    description: 'Real government roles, internships, and public-sector programs.',
    group: 'Topic',
    match: tagIncludes('government'),
  },
  {
    slug: 'competitions',
    icon: '🏆',
    title: 'Competitions & hackathons',
    pageTitle: 'Competitions & Hackathons — OppIDX',
    description: 'Real competitions and hackathons worth your time — hand-checked before they go up.',
    group: 'Topic',
    match: tagIncludes('competition', 'hackathon'),
  },
  {
    slug: 'startups',
    icon: '🚀',
    title: 'Startup opportunities',
    pageTitle: 'Startup Jobs, Internships & Programs — OppIDX',
    description: 'Real roles and programs at startups — verified, not scraped junk.',
    group: 'Topic',
    match: tagIncludes('startup'),
  },
  {
    slug: 'infrastructure-and-sre',
    icon: '🛠',
    title: 'Infrastructure & SRE opportunities',
    pageTitle: 'Infrastructure & SRE Jobs — OppIDX',
    description: 'Real infrastructure, DevOps, and site-reliability roles.',
    group: 'Topic',
    match: tagIncludes('infrastructure & sre', 'sys admin'),
  },
  {
    slug: 'research',
    icon: '🔬',
    title: 'Research opportunities',
    pageTitle: 'Research Jobs, Internships & Fellowships — OppIDX',
    description: 'Real research roles, internships, and fellowships across fields.',
    group: 'Topic',
    match: tagIncludes('research'),
  },
  {
    slug: 'customer-support',
    icon: '🎧',
    title: 'Customer support opportunities',
    pageTitle: 'Customer Support Jobs — OppIDX',
    description: 'Real customer support and customer success roles.',
    group: 'Topic',
    match: tagIncludes('customer support'),
  },
  {
    slug: 'design',
    icon: '🎨',
    title: 'Design opportunities',
    pageTitle: 'Design Jobs & Internships — OppIDX',
    description: 'Real design roles and internships — product, graphic, and UX.',
    group: 'Topic',
    match: tagIncludes('design', 'designer'),
  },
  {
    slug: 'marketing',
    icon: '📣',
    title: 'Marketing opportunities',
    pageTitle: 'Marketing Jobs & Internships — OppIDX',
    description: 'Real marketing roles and internships — hand-checked before they go up.',
    group: 'Topic',
    match: tagIncludes('marketing'),
  },
  {
    slug: 'security-engineering',
    icon: '🔒',
    title: 'Security engineering opportunities',
    pageTitle: 'Security Engineering Jobs — OppIDX',
    description: 'Real security and infosec engineering roles.',
    group: 'Topic',
    match: tagIncludes('security engineering'),
  },
  {
    slug: 'hardware-and-robotics',
    icon: '⚙️',
    title: 'Hardware & robotics opportunities',
    pageTitle: 'Hardware & Robotics Jobs & Internships — OppIDX',
    description: 'Real hardware, robotics, and mechanical-adjacent engineering roles.',
    group: 'Topic',
    match: tagIncludes('hardware', 'robotics'),
  },
  {
    slug: 'beginner-friendly',
    icon: '🌱',
    title: 'Beginner-friendly opportunities',
    pageTitle: 'Beginner-Friendly Jobs & Internships — OppIDX',
    description: 'Real opportunities that don’t assume years of experience — a genuine way in.',
    group: 'Topic',
    match: opp => opp.difficulty === 'Easy' || tagIncludes('beginner friendly')(opp),
  },

  // ── By location — remote plus every country with real, non-thin depth
  // (checked against the live DB: US 852, India 287, Canada 51, UK 36,
  // Germany 18, Switzerland 15 — the next country down drops to 7) ──
  {
    slug: 'remote',
    icon: '🌍',
    title: 'Remote opportunities',
    pageTitle: 'Remote Jobs & Internships — OppIDX',
    description: 'Real remote roles and internships — work from anywhere, verified before they go up.',
    group: 'Location',
    match: opp => /\bremote\b/i.test(opp.location ?? '') || /\bremote\b/i.test(opp.region ?? ''),
  },
  {
    slug: 'united-states',
    icon: '🇺🇸',
    title: 'Opportunities in the United States',
    pageTitle: 'Jobs & Internships in the United States — OppIDX',
    description: 'Real opportunities based in the United States — verified, not scraped junk.',
    group: 'Location',
    match: opp => opp.country === 'United States',
  },
  {
    slug: 'india',
    icon: '🇮🇳',
    title: 'Opportunities in India',
    pageTitle: 'Jobs & Internships in India — OppIDX',
    description: 'Real opportunities based in India — verified, not scraped junk.',
    group: 'Location',
    match: opp => opp.country === 'India',
  },
  {
    slug: 'canada',
    icon: '🇨🇦',
    title: 'Opportunities in Canada',
    pageTitle: 'Jobs & Internships in Canada — OppIDX',
    description: 'Real opportunities based in Canada — verified, not scraped junk.',
    group: 'Location',
    match: opp => opp.country === 'Canada',
  },
  {
    slug: 'united-kingdom',
    icon: '🇬🇧',
    title: 'Opportunities in the United Kingdom',
    pageTitle: 'Jobs & Internships in the United Kingdom — OppIDX',
    description: 'Real opportunities based in the United Kingdom — verified, not scraped junk.',
    group: 'Location',
    match: opp => opp.country === 'United Kingdom',
  },
  {
    slug: 'germany',
    icon: '🇩🇪',
    title: 'Opportunities in Germany',
    pageTitle: 'Jobs & Internships in Germany — OppIDX',
    description: 'Real opportunities based in Germany — verified, not scraped junk.',
    group: 'Location',
    match: opp => opp.country === 'Germany',
  },
  {
    slug: 'switzerland',
    icon: '🇨🇭',
    title: 'Opportunities in Switzerland',
    pageTitle: 'Jobs & Internships in Switzerland — OppIDX',
    description: 'Real opportunities based in Switzerland — verified, not scraped junk.',
    group: 'Location',
    match: opp => opp.country === 'Switzerland',
  },

  // ── By compensation (real compType field: Paid 497, Stipend 91, Equity 51) ──
  {
    slug: 'paid',
    icon: '💵',
    title: 'Paid opportunities',
    pageTitle: 'Paid Jobs & Internships — OppIDX',
    description: 'Real, paid opportunities — verified before they go up, no unpaid bait.',
    group: 'Compensation',
    match: opp => opp.compType === 'Paid',
  },
  {
    slug: 'stipend',
    icon: '🎫',
    title: 'Stipend opportunities',
    pageTitle: 'Stipend Jobs & Internships — OppIDX',
    description: 'Real opportunities that pay a stipend — verified before they go up.',
    group: 'Compensation',
    match: opp => opp.compType === 'Stipend',
  },
  {
    slug: 'equity',
    icon: '📈',
    title: 'Equity opportunities',
    pageTitle: 'Equity-Based Opportunities — OppIDX',
    description: 'Real startup and founder-track opportunities offering equity.',
    group: 'Compensation',
    match: opp => opp.compType === 'Equity',
  },
]

export function getCollectionDef(slug: string): CollectionDef | undefined {
  return COLLECTION_DEFS.find(c => c.slug === slug)
}
