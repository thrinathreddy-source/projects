import { createSign } from 'crypto'
import { SITE_URL } from '@/lib/siteUrl'
import { isEligibleJobPosting, type JobPostingCandidate } from './jobPosting'
import { opportunityPath } from '@/lib/slug'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const INDEXING_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish'
const SCOPES = [
  'https://www.googleapis.com/auth/indexing',
  'https://www.googleapis.com/auth/webmasters.readonly',
].join(' ')

interface GoogleServiceAccount {
  clientEmail: string
  privateKey: string
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

function getServiceAccount(): GoogleServiceAccount | null {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  return clientEmail && privateKey ? { clientEmail, privateKey } : null
}

async function accessToken(): Promise<string | null> {
  const account = getServiceAccount()
  if (!account) return null

  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(JSON.stringify({
    iss: account.clientEmail, scope: SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }))}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const assertion = `${unsigned}.${signer.sign(account.privateKey).toString('base64url')}`

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    })
    const data = await response.json() as { access_token?: string }
    return response.ok && data.access_token ? data.access_token : null
  } catch (error) {
    console.error('[google-indexing] token request failed:', error)
    return null
  }
}

export interface IndexingCandidate extends JobPostingCandidate { id: string }

/** Notify Google about newly published JobPosting pages. A no-op without the
 * service-account environment variables, keeping scraping independent of
 * external SEO credentials. */
export async function notifyGoogleJobPostingUpdates(candidates: IndexingCandidate[]): Promise<{ attempted: number; sent: number; failed: number; configured: boolean }> {
  const eligible = candidates.filter(isEligibleJobPosting)
  const token = await accessToken()
  if (!token) return { attempted: eligible.length, sent: 0, failed: 0, configured: Boolean(getServiceAccount()) }

  const results = await Promise.allSettled(eligible.map(async candidate => {
    const response = await fetch(INDEXING_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `${SITE_URL}${opportunityPath(candidate)}`, type: 'URL_UPDATED' }),
    })
    if (!response.ok) throw new Error(`Google Indexing API ${response.status}`)
  }))
  const sent = results.filter(result => result.status === 'fulfilled').length
  const failed = results.length - sent
  if (failed) console.error(`[google-indexing] ${failed}/${eligible.length} publication notifications failed`)
  return { attempted: eligible.length, sent, failed, configured: true }
}

/**
 * Tell Google a JobPosting page is gone.
 *
 * The counterpart to notifyGoogleJobPostingUpdates, and the half that was
 * missing: the board had no way to retire anything, so it only ever announced
 * new listings and never withdrew dead ones. Google's job-posting policy
 * expects expired postings to be removed promptly, and URL_DELETED is the
 * fastest signal available — far quicker than waiting for a recrawl to
 * discover the page 404s.
 *
 * Same eligibility gate as publication, because Google only accepts Indexing
 * API calls for URLs that carried JobPosting markup; sending it for a
 * scholarship would be an API-terms violation, not a harmless no-op.
 */
export async function notifyGoogleJobPostingRemovals(candidates: IndexingCandidate[]): Promise<{ attempted: number; sent: number; failed: number; configured: boolean }> {
  const eligible = candidates.filter(isEligibleJobPosting)
  const token = await accessToken()
  if (!token) return { attempted: eligible.length, sent: 0, failed: 0, configured: Boolean(getServiceAccount()) }

  const results = await Promise.allSettled(eligible.map(async candidate => {
    const response = await fetch(INDEXING_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `${SITE_URL}${opportunityPath(candidate)}`, type: 'URL_DELETED' }),
    })
    if (!response.ok) throw new Error(`Google Indexing API ${response.status}`)
  }))
  const sent = results.filter(result => result.status === 'fulfilled').length
  const failed = results.length - sent
  if (failed) console.error(`[google-indexing] ${failed}/${eligible.length} removal notifications failed`)
  return { attempted: eligible.length, sent, failed, configured: true }
}

export interface SearchConsoleReport {
  configured: boolean
  clicks: number
  impressions: number
  ctr: number
  position: number
  topQueries: Array<{ query: string; clicks: number; impressions: number; position: number }>
}

/** Returns the last seven complete days of Search Console data. The service
 * account must be added as an owner/user to the verified property. */
export async function getSearchConsoleReport(): Promise<SearchConsoleReport> {
  const token = await accessToken()
  const siteUrl = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL
  const empty: SearchConsoleReport = { configured: Boolean(token && siteUrl), clicks: 0, impressions: 0, ctr: 0, position: 0, topQueries: [] }
  if (!token || !siteUrl) return empty

  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 3) // Search Console data is commonly delayed.
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 6)
  const iso = (date: Date) => date.toISOString().slice(0, 10)

  try {
    const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const dateRange = { startDate: iso(start), endDate: iso(end) }
    const [totalsResponse, queriesResponse] = await Promise.all([
      fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(dateRange) }),
      fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ ...dateRange, dimensions: ['query'], rowLimit: 10 }) }),
    ])
    const [totalsData, queriesData] = await Promise.all([
      totalsResponse.json() as Promise<{ rows?: Array<{ clicks: number; impressions: number; ctr: number; position: number }> }>,
      queriesResponse.json() as Promise<{ rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> }>,
    ])
    if (!totalsResponse.ok || !queriesResponse.ok) throw new Error(`Search Console API ${totalsResponse.status}/${queriesResponse.status}`)
    const totals = totalsData.rows?.[0]
    const rows = queriesData.rows ?? []
    const clicks = totals?.clicks ?? 0
    const impressions = totals?.impressions ?? 0
    return {
      configured: true, clicks, impressions, ctr: totals?.ctr ?? 0, position: totals?.position ?? 0,
      topQueries: rows.map(row => ({ query: row.keys[0], clicks: row.clicks, impressions: row.impressions, position: row.position })),
    }
  } catch (error) {
    console.error('[search-console] report request failed:', error)
    return empty
  }
}
