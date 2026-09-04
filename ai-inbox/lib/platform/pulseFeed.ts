/**
 * Real, no-AI content pipeline for /pulse. Plain fetch + regex extraction +
 * keyword classification per country — zero LLM calls, zero token cost,
 * fully deterministic, safe to run on a cron every day.
 *
 * Structured per country (see COUNTRY_SOURCES below) so a new country is a
 * new config entry, not a rewrite — but every source in it has to be real
 * and verified live before being added, same rule India's sources already
 * followed. No country gets a fabricated or guessed feed just to have
 * "coverage": a country with no verified source here simply isn't
 * ingested yet, same as everywhere else in this codebase leaves a gap
 * blank rather than faking it.
 *
 * English only, on purpose, for every country: PIB serves English or Hindi
 * unpredictably regardless of the requested language param (confirmed by
 * testing), so every item is checked for Devanagari script and dropped if
 * found — harmless no-op for countries whose sources are English by
 * construction (US), a real filter for India's.
 */

export interface RawHeadline {
  title: string;
  url: string;
  source: string;
}

export type PulseSourceType = "government" | "newspaper";
export type CountryCode = "IN" | "US" | "GB";

export interface ClassifiedHeadline extends RawHeadline {
  category: string;
  sourceType: PulseSourceType;
  country: CountryCode;
}

// ── Shared RSS item extraction ───────────────────────────────────────────────
// Every RSS source here uses the same flat <item><title>/<link></item> shape.
// Some publishers wrap values in CDATA, some don't — handle both.

function unwrap(raw: string): string {
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  const inner = cdata ? cdata[1] : raw;
  return inner
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function extractItems(xml: string): { title: string; url: string }[] {
  const items: { title: string; url: string }[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    if (!titleMatch || !linkMatch) continue;
    const title = unwrap(titleMatch[1]);
    const url = unwrap(linkMatch[1]);
    if (title && url) items.push({ title, url });
  }
  return items;
}

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchText(url: string): Promise<string> {
  // A self-identifying bot UA (e.g. "SomethingBot/1.0") gets a 403 from PIB's
  // Akamai edge and a bot-detection redirect from federalregister.gov's own
  // HTML/RSS surface (confirmed by testing) — a standard browser UA is
  // required, and works fine for every source below.
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

async function fetchRss(url: string): Promise<{ title: string; url: string }[]> {
  return extractItems(await fetchText(url));
}

// gov.uk's own news feed is Atom, not RSS 2.0 — <entry> instead of <item>,
// and <link> is a self-closing tag with an href attribute instead of text
// content. Verified live: https://www.gov.uk/search/news-and-communications.atom
function extractAtomItems(xml: string): { title: string; url: string }[] {
  const items: { title: string; url: string }[] = [];
  const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) {
    const block = m[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]*)"/);
    if (!titleMatch || !linkMatch) continue;
    const title = unwrap(titleMatch[1]);
    const url = unwrap(linkMatch[1]);
    if (title && url) items.push({ title, url });
  }
  return items;
}

async function fetchAtom(url: string): Promise<{ title: string; url: string }[]> {
  return extractAtomItems(await fetchText(url));
}

const DEVANAGARI = /[ऀ-ॿ]/;
// Exported for lib/policyDigest/generate.ts — the digest reads whatever is
// currently sitting in Supabase's pulse_headlines table rather than a fresh
// getAllHeadlines() pass, and that table can hold rows fetched before this
// filter existed (or from a request PIB happened to answer in Hindi despite
// the requested language param) until the 14-day cleanup sweep removes them.
// Re-checking here is a second gate, not a redundant one.
export function isEnglish(title: string): boolean {
  return !DEVANAGARI.test(title);
}

// ── Exclusion filter — second safety net on top of source-level curation ────
// Split into a shared, genuinely country-agnostic layer (conflict/violence
// terms, generic election coverage) and a per-country layer for party/
// politician names — "Congress" alone, for example, means something totally
// different (and totally neutral — the literal U.S. legislative branch,
// cited constantly in Federal Register/SEC text) in a US context than it
// does as an Indian political party name, so that one can never be shared.
const SHARED_EXCLUDE_PATTERNS: RegExp[] = [
  /\bterroris(m|t)\b/i,
  /\bmilitary\s+operation\b/i,
  /\bairstrike\b/i,
  /\bcasualties\b/i,
  /\belection(s)?\b/i,
  /\bpoll(s)?\b.*\b(vote|ballot)\b/i,
  /\bceasefire\b/i,
  /\bmartyr(ed)?\b/i,
  /\bprotest(s|ers|ing)?\b/i,
];

const COUNTRY_EXCLUDE_PATTERNS: Record<CountryCode, RegExp[]> = {
  IN: [
    /\bparty\s+(manifesto|workers|rally)\b/i,
    /\bopposition\s+(leader|party)\b/i,
    /\bMLA\b/i, /\bMP\b/i, /\bBJP\b/i, /\bCongress\b/i, /\bRahul Gandhi\b/i, /\bcabinet\s+reshuffle\b/i,
  ],
  US: [
    /\bRepublican(s)?\b/i, /\bDemocrat(ic)?(s)?\b/i, /\bGOP\b/i,
    /\bimpeachment\b/i, /\bpartisan\b/i, /\bcampaign\s+(rally|finance|trail)\b/i,
  ],
  GB: [
    /\bConservative\s+Party\b/i, /\bLabour\s+Party\b/i, /\bTory\b/i, /\bTories\b/i,
    /\bLib\s+Dem(s)?\b/i, /\bReform\s+UK\b/i, /\bSNP\b/i,
    /\bby-election\b/i, /\bpartisan\b/i, /\bno[-\s]confidence\b/i,
  ],
};

function isExcluded(title: string, country: CountryCode): boolean {
  return SHARED_EXCLUDE_PATTERNS.some((p) => p.test(title)) || COUNTRY_EXCLUDE_PATTERNS[country].some((p) => p.test(title));
}

// ── Category classifier — plain keyword matching, no AI ─────────────────────
// Shared across countries: the concepts (health, education, markets...) and
// most of the English keywords behind them are genuinely universal. The
// handful of India-specific acronyms mixed in (PMGSY, yojana, anganwadi,
// CAQM, AYUSH) just never fire against non-Indian text — harmless to leave
// in a shared list rather than forking the whole taxonomy per country.
const CATEGORY_RULES: { category: string; patterns: RegExp[] }[] = [
  { category: "Health & Sanitation", patterns: [/\bhealth\b/i, /\bsanitation\b/i, /\bhospital\b/i, /\bsewer\b/i, /\bseptic\b/i, /\bswachh\b/i, /\bAYUSH\b/i, /\bmedical\b/i, /\bFDA\b/i, /\bCDC\b/i, /\bNHS\b/i] },
  { category: "Education & Skilling", patterns: [/\beducation\b/i, /\bschool\b/i, /\bskill\b/i, /\bNCVET\b/i, /\btraining\s+institute\b/i, /\buniversity\b/i, /\bliteracy\b/i, /\bstudent\s+loan\b/i, /\bDepartment of Education\b/i, /\bOfsted\b/i, /\bDfE\b/i] },
  { category: "Women & Child Welfare", patterns: [/\bwomen\b/i, /\bchild\b/i, /\bminorit(y|ies)\b/i, /\bgender\b/i, /\banganwadi\b/i] },
  { category: "Rural Development", patterns: [/\brural\b/i, /\bpanchayat\b/i, /\bPMGSY\b/i, /\bPMAY-G\b/i, /\bNRLM\b/i, /\bNSAP\b/i, /\bgram\b/i] },
  { category: "Agriculture", patterns: [/\bagricultur(e|al)\b/i, /\bfarmer\b/i, /\bfertiliser\b/i, /\bfertilizer\b/i, /\bcrop\b/i, /\birrigation\b/i, /\bmonsoon\b/i, /\bseed\b/i, /\breservoir\b/i, /\bUSDA\b/i, /\bDefra\b/i] },
  { category: "Environment & Cleanliness", patterns: [/\benvironment\b/i, /\bpollution\b/i, /\bCAQM\b/i, /\bair\s+quality\b/i, /\bwaste\b/i, /\bclean(liness|-up)?\b/i, /\bforest\b/i, /\bEPA\b/i, /\bemissions\b/i, /\bOfgem\b/i] },
  { category: "Infrastructure", patterns: [/\binfrastructure\b/i, /\broad(s)?\b/i, /\brailway\b/i, /\bhighway\b/i, /\bdigit(al|isation|ization)\b/i, /\bdrone\b/i, /\baviation\b/i, /\bFAA\b/i, /\bFCC\b/i, /\bOfcom\b/i] },
  { category: "Governance & Welfare Schemes", patterns: [/\bscheme\b/i, /\bministry\b/i, /\byojana\b/i, /\bwelfare\b/i, /\bfinancial\s+inclusion\b/i, /\bexecutive\s+order\b/i, /\bagency\s+rule\b/i, /\bfederal\s+register\b/i, /\bDWP\b/i, /\bWhitehall\b/i] },
  { category: "Markets & Business", patterns: [/\bshares?\b/i, /\bstock(s)?\b/i, /\bIPO\b/i, /\bprofit\b/i, /\bmarket(s)?\b/i, /\bRBI\b/i, /\bSEC\b/i, /\bbank(ing|s)?\b/i, /\bcompany\b/i, /\bearnings\b/i, /\brupee\b/i, /\bdollar\b/i, /\bGDP\b/i, /\beconomy\b/i, /\btariff(s)?\b/i, /\bFCA\b/i, /\bBank of England\b/i, /\bHMRC\b/i, /\bpound\s+sterling\b/i] },
];

function classifyCategory(title: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(title))) return rule.category;
  }
  return "National Development";
}

// ── India ─────────────────────────────────────────────────────────────────
// 1. Government — the Press Information Bureau's own official press-release
//    feed. Official announcements, so by construction policy/scheme
//    content, not opinion.
// 2. Regulatory — RBI and SEBI's own official feeds, same official standing
//    as PIB. Both verified live: https://www.rbi.org.in/pressreleases_rss.xml
//    and https://www.sebi.gov.in/sebirss.xml
// 3. Newspaper — business/economy section feeds from The Hindu, Indian
//    Express, and LiveMint. Section-scoped on purpose.
const PIB_REGIONS = [3, 1]; // Delhi, Mumbai — PIB's language is server-side
// and inconsistent per region/request; fetching a couple of regions and
// keeping only the English results is more reliable than depending on any
// single region to return English today.

async function fetchIndiaGovernment(): Promise<RawHeadline[]> {
  const results = await Promise.allSettled(
    PIB_REGIONS.map((reg) => fetchRss(`https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=${reg}`))
  );
  const seen = new Set<string>();
  const out: RawHeadline[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      out.push({ ...item, source: "Press Information Bureau, Govt. of India" });
    }
  }
  return out;
}

const INDIA_REGULATORY_FEEDS: { source: string; url: string }[] = [
  { source: "Reserve Bank of India", url: "https://www.rbi.org.in/pressreleases_rss.xml" },
  { source: "SEBI", url: "https://www.sebi.gov.in/sebirss.xml" },
];

const INDIA_NEWSPAPER_FEEDS: { source: string; url: string }[] = [
  { source: "The Hindu", url: "https://www.thehindu.com/business/feeder/default.rss" },
  { source: "The Indian Express", url: "https://indianexpress.com/section/business/feed/" },
  { source: "LiveMint", url: "https://www.livemint.com/rss/economy" },
];

async function fetchRssList(feeds: { source: string; url: string }[]): Promise<RawHeadline[]> {
  const results = await Promise.allSettled(feeds.map((f) => fetchRss(f.url)));
  const out: RawHeadline[] = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    for (const item of r.value) out.push({ ...item, source: feeds[i].source });
  });
  return out;
}

// ── United States ────────────────────────────────────────────────────────
// 1. Government — the Federal Register's own official public API (the
//    U.S. government's daily journal of rules, proposed rules, and notices
//    from every federal agency — the direct structural equivalent of PIB).
//    Its own RSS/HTML search surface returns a bot-detection redirect
//    ("unblock.federalregister.gov") even with a browser UA; the JSON API
//    does not have that problem. Verified live:
//    https://www.federalregister.gov/api/v1/articles.json
// 2. Regulatory — the SEC's own official press-release feed, the direct
//    equivalent of SEBI. Verified live:
//    https://www.sec.gov/news/pressreleases.rss
// No newspaper tier for the US yet — deliberately: every India newspaper
// feed above was individually verified live before being added, and doing
// the same diligence for a US outlet is future work, not a guess.
interface FederalRegisterArticle {
  title: string;
  html_url: string;
  agencies?: { name: string }[];
}

async function fetchUsGovernment(): Promise<RawHeadline[]> {
  // No date filter — the Federal Register only publishes on business days,
  // so a strict "today" condition returns nothing on weekends/holidays
  // (verified: the API 400s on the literal string "today" and returns
  // `{"count":0}` for a real weekend date). Newest-first with a generous
  // per_page instead, same "just take what's recent" shape as PIB/SEBI's
  // feeds, which have no date filter either.
  const res = await fetch(
    "https://www.federalregister.gov/api/v1/articles.json?per_page=40&order=newest",
    { headers: { "User-Agent": BROWSER_UA }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Federal Register API returned ${res.status}`);
  const data = (await res.json()) as { results: FederalRegisterArticle[] };
  return (data.results ?? []).map((a) => ({
    title: a.title,
    url: a.html_url,
    source: a.agencies?.[0]?.name ? `Federal Register · ${a.agencies[0].name}` : "Federal Register",
  }));
}

const US_REGULATORY_FEEDS: { source: string; url: string }[] = [
  { source: "U.S. Securities and Exchange Commission", url: "https://www.sec.gov/news/pressreleases.rss" },
];

// ── United Kingdom ───────────────────────────────────────────────────────
// 1. Government — GOV.UK's own official "News and communications" feed,
//    the direct structural equivalent of PIB/Federal Register: every UK
//    government department's announcements in one place, run by HM
//    Government itself. Atom, not RSS (see extractAtomItems above).
//    Verified live: https://www.gov.uk/search/news-and-communications.atom
// 2. Regulatory — the Financial Conduct Authority (SEBI/SEC's equivalent)
//    and the Bank of England (RBI's equivalent), both official RSS feeds.
//    Verified live: https://www.fca.org.uk/news/rss.xml and
//    https://www.bankofengland.co.uk/rss/news
// No newspaper tier yet — same reasoning as US: individually verifying a
// UK outlet's section feed is future work, not a guess.
async function fetchUkGovernment(): Promise<RawHeadline[]> {
  const items = await fetchAtom("https://www.gov.uk/search/news-and-communications.atom");
  return items.map((i) => ({ ...i, source: "GOV.UK" }));
}

const UK_REGULATORY_FEEDS: { source: string; url: string }[] = [
  { source: "Financial Conduct Authority", url: "https://www.fca.org.uk/news/rss.xml" },
  { source: "Bank of England", url: "https://www.bankofengland.co.uk/rss/news" },
];

interface CountrySource {
  fetchGovernment: () => Promise<RawHeadline[]>;
  fetchRegulatory: () => Promise<RawHeadline[]>;
  fetchNewspaper: () => Promise<RawHeadline[]>;
}

const COUNTRY_SOURCES: Record<CountryCode, CountrySource> = {
  IN: {
    fetchGovernment: fetchIndiaGovernment,
    fetchRegulatory: () => fetchRssList(INDIA_REGULATORY_FEEDS),
    fetchNewspaper: () => fetchRssList(INDIA_NEWSPAPER_FEEDS),
  },
  US: {
    fetchGovernment: fetchUsGovernment,
    fetchRegulatory: () => fetchRssList(US_REGULATORY_FEEDS),
    fetchNewspaper: async () => [],
  },
  GB: {
    fetchGovernment: fetchUkGovernment,
    fetchRegulatory: () => fetchRssList(UK_REGULATORY_FEEDS),
    fetchNewspaper: async () => [],
  },
};

export const SUPPORTED_COUNTRIES: CountryCode[] = ["IN", "US", "GB"];

async function classify(raw: RawHeadline[], sourceType: PulseSourceType, country: CountryCode): Promise<ClassifiedHeadline[]> {
  return raw
    .filter((h) => isEnglish(h.title) && !isExcluded(h.title, country))
    .map((h) => ({ ...h, category: classifyCategory(h.title), sourceType, country }));
}

export async function getAllHeadlines(country: CountryCode): Promise<ClassifiedHeadline[]> {
  const src = COUNTRY_SOURCES[country];
  const [gov, regulatory, papers] = await Promise.all([
    src.fetchGovernment().catch((e) => { console.error(`[pulseFeed:${country}] government fetch failed:`, e); return []; }),
    src.fetchRegulatory().catch((e) => { console.error(`[pulseFeed:${country}] regulatory fetch failed:`, e); return []; }),
    src.fetchNewspaper().catch((e) => { console.error(`[pulseFeed:${country}] newspaper fetch failed:`, e); return []; }),
  ]);
  const [govClassified, regulatoryClassified, papersClassified] = await Promise.all([
    classify(gov, "government", country),
    classify(regulatory, "government", country),
    classify(papers, "newspaper", country),
  ]);
  return [...govClassified, ...regulatoryClassified, ...papersClassified];
}
