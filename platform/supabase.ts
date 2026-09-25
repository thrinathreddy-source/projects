import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Public client — for browser use. Lazily constructed (a Proxy that only
// calls createClient() on first real use, not at module-evaluation time):
// `createClient()` throws immediately if the URL/key are missing, and this
// module now gets pulled into the core OppIDX bundle too (see
// components/ui/FindYourPersonModal.tsx), not just the matching pages —
// eagerly throwing here would take down every page that renders an
// OpportunityCard in any environment missing these two env vars, not just
// the matching pages.
let realClient: SupabaseClient | null = null
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!realClient) {
      if (!url || !anon) throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing).")
      realClient = createClient(url, anon)
    }
    return Reflect.get(realClient, prop, realClient)
  },
})

// Service-role client — server-only, bypasses RLS
export const supabaseAdmin = (service && url)
  ? createClient(url, service)
  : null;
