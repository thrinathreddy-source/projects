/**
 * Master paywall switch. Off until there's enough real user flow to justify
 * gating search — an early visitor hitting a paywall on visit one is a lost
 * user, not a conversion. Flip back to true once there's traffic worth
 * protecting; nothing else needs to change, every restriction check below
 * reads from this one flag.
 */
export const PAYWALL_ENABLED = false

/**
 * Free tier's cap across every public surface that lists opportunities in
 * bulk — /browse search, and the RSS feed. The homepage's hourly-rotating
 * "best opportunities" picks are a separate, exempt allowance (see
 * app/api/opportunities/route.ts). Subscribers with an active paid plan
 * bypass this everywhere it's checked. Keeping this in one place means the
 * RSS feed can't become an unintended back door around the paywall.
 */
export const FREE_SEARCH_LIMIT = 10
