import { createClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Public client — for browser use
export const supabase = createClient(url, anon);

// Service-role client — server-only, bypasses RLS
export const supabaseAdmin = service
  ? createClient(url, service)
  : null;
