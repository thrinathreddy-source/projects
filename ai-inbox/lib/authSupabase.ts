// Neutral re-export of the single Supabase client the matching side uses —
// deliberately NOT a second createClient() call. Two independently-created
// clients pointed at the same project would each run their own GoTrueClient
// with its own auto-refresh timer, which supabase-js explicitly warns
// against ("Multiple GoTrueClient instances detected"). This just gives
// the rest of the app a neutral import path onto the
// exact same identity provider.
export { supabase, supabaseAdmin } from './platform/supabase'
