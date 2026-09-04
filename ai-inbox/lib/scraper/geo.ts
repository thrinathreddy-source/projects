export interface Geo {
  region: string
  country: string
}

const UNKNOWN: Geo = { region: '', country: '' }
const REMOTE_GLOBAL: Geo = { region: 'Remote / Global', country: '' }

// Ordered, most-specific-first. Checked against the raw location string
// (case-insensitive). First match wins — deterministic, no AI, no guessing
// beyond what the text actually says.
const COUNTRY_PATTERNS: { pattern: RegExp; region: string; country: string }[] = [
  // Asia
  { pattern: /\bindia\b/i, region: 'Asia', country: 'India' },
  // Indian states/cities that often appear without the word "India" itself.
  {
    pattern: /\b(karnataka|maharashtra|uttar pradesh|telangana|tamil nadu|haryana|gujarat|west bengal|kerala|rajasthan|punjab|delhi|noida|gurugram|gurgaon)\b/i,
    region: 'Asia', country: 'India',
  },
  {
    pattern: /\b(bangalore|bengaluru|mumbai|hyderabad|chennai|pune|kolkata|ahmedabad|jaipur|vadodara|nagpur)\b/i,
    region: 'Asia', country: 'India',
  },
  { pattern: /\bsingapore\b/i, region: 'Asia', country: 'Singapore' },
  { pattern: /\bjapan\b/i, region: 'Asia', country: 'Japan' },
  { pattern: /\b(south korea|korea)\b/i, region: 'Asia', country: 'South Korea' },
  { pattern: /\bchina\b/i, region: 'Asia', country: 'China' },
  { pattern: /\b(united arab emirates|dubai|abu dhabi)\b/i, region: 'Asia', country: 'United Arab Emirates' },
  { pattern: /\bapac\b/i, region: 'Asia', country: '' },

  // Europe
  { pattern: /\bportugal\b/i, region: 'Europe', country: 'Portugal' },
  { pattern: /\bitaly\b/i, region: 'Europe', country: 'Italy' },
  { pattern: /\bgermany\b/i, region: 'Europe', country: 'Germany' },
  { pattern: /\b(united kingdom|england|scotland|wales)\b/i, region: 'Europe', country: 'United Kingdom' },
  { pattern: /\bireland\b/i, region: 'Europe', country: 'Ireland' },
  { pattern: /\bnetherlands\b/i, region: 'Europe', country: 'Netherlands' },
  { pattern: /\bswitzerland\b/i, region: 'Europe', country: 'Switzerland' },
  { pattern: /\biceland\b|reykjav[ií]k/i, region: 'Europe', country: 'Iceland' },
  { pattern: /\bfrance\b|\bparis\b/i, region: 'Europe', country: 'France' },
  { pattern: /\bspain\b/i, region: 'Europe', country: 'Spain' },
  { pattern: /\bsweden\b/i, region: 'Europe', country: 'Sweden' },
  { pattern: /\bgeneva\b/i, region: 'Europe', country: 'Switzerland' },
  { pattern: /\bvienna\b/i, region: 'Europe', country: 'Austria' },
  { pattern: /\bberlin\b/i, region: 'Europe', country: 'Germany' },
  { pattern: /\blondon\b/i, region: 'Europe', country: 'United Kingdom' },
  { pattern: /\boxford\b|\bcambridge, united kingdom\b/i, region: 'Europe', country: 'United Kingdom' },

  // Africa
  { pattern: /\begypt\b/i, region: 'Africa', country: 'Egypt' },
  { pattern: /\bmorocco\b/i, region: 'Africa', country: 'Morocco' },
  { pattern: /\bethiopia\b/i, region: 'Africa', country: 'Ethiopia' },
  { pattern: /\bnigeria\b/i, region: 'Africa', country: 'Nigeria' },
  { pattern: /\bkenya\b|\bnairobi\b/i, region: 'Africa', country: 'Kenya' },
  { pattern: /\bsouth africa\b/i, region: 'Africa', country: 'South Africa' },

  // Oceania
  { pattern: /\baustralia\b/i, region: 'Oceania', country: 'Australia' },
  { pattern: /\bnew zealand\b/i, region: 'Oceania', country: 'New Zealand' },

  // South America
  { pattern: /\bbrazil\b/i, region: 'South America', country: 'Brazil' },
  { pattern: /\bargentina\b/i, region: 'South America', country: 'Argentina' },

  // North America — Canada before the generic US patterns since some
  // strings mix both ("United States and Canada").
  { pattern: /\bcanada\b|\btoronto\b|\bedmonton\b/i, region: 'North America', country: 'Canada' },
  // Note: no trailing \b after "u.s." — a period followed by a space has no
  // word-boundary transition, so \b would never match there.
  { pattern: /\bunited states\b|\busa\b|\bu\.s\.a?\.?/i, region: 'North America', country: 'United States' },
  // Common unlabeled US city/state text — matched only if nothing above hit.
  {
    pattern: /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/,
    region: 'North America',
    country: 'United States',
  },
  {
    pattern: /\b(california|texas|massachusetts|michigan|missouri|virginia|washington|rhode island|new hampshire|iowa|montana|illinois|minnesota|new york|silicon valley|washington,? d\.?c\.?)\b/i,
    region: 'North America',
    country: 'United States',
  },
  // Well-known US cities that often appear with no state/country suffix.
  {
    pattern: /\b(san francisco|nyc|seattle|boston|chicago|austin|atlanta|denver|los angeles|miami|portland)\b/i,
    region: 'North America',
    country: 'United States',
  },
  // Bare "US" as a standalone capitalized token (case-sensitive — lowercase
  // "us" is almost always the pronoun, e.g. "join us", not the country).
  { pattern: /\bUS\b/, region: 'North America', country: 'United States' },
]

// Literal continent names with no more specific country in the text —
// checked after COUNTRY_PATTERNS so a named country always wins.
const CONTINENT_PATTERNS: { pattern: RegExp; region: string }[] = [
  { pattern: /\beurope\b/i, region: 'Europe' },
  { pattern: /\bafrica\b/i, region: 'Africa' },
  { pattern: /\basia\b/i, region: 'Asia' },
  { pattern: /\boceania\b/i, region: 'Oceania' },
  { pattern: /\bnorth america\b/i, region: 'North America' },
  { pattern: /\bsouth america\b/i, region: 'South America' },
]

const REMOTE_GLOBAL_PATTERN = /\b(global|worldwide|online|remote)\b/i

// Same US state list already used above to classify country/region, reused
// here for schema.org's `addressRegion` — a much narrower claim than
// region/country: only fires on the specific, unambiguous "City, ST"
// pattern, not the looser full-state-name or bare-city matches used for
// the broader region field. Blank for anything else (including non-US
// locations) rather than guess.
const US_STATE_SUFFIX = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s*$/

/** Deterministic, conservative extraction of a JobPosting-suitable
 * addressRegion from free text — only the unambiguous "City, ST" suffix,
 * never a guess. Returns "" when the location doesn't end in a
 * recognizable US state code. */
export function extractAddressRegion(location?: string | null): string {
  if (!location) return ''
  const match = US_STATE_SUFFIX.exec(location)
  return match ? match[1] : ''
}

/** Best-effort, deterministic classification from free-text location —
 * never guesses beyond what the text says. Returns "" for both fields
 * when nothing in the string is recognizable. */
export function inferGeo(location?: string | null): Geo {
  if (!location) return UNKNOWN

  for (const { pattern, region, country } of COUNTRY_PATTERNS) {
    if (pattern.test(location)) return { region, country }
  }

  for (const { pattern, region } of CONTINENT_PATTERNS) {
    if (pattern.test(location)) return { region, country: '' }
  }

  if (REMOTE_GLOBAL_PATTERN.test(location)) return REMOTE_GLOBAL

  return UNKNOWN
}
