import { NextResponse } from 'next/server'
import { destroySubscriberSession } from '@/lib/subscriberSession'

/** POST /api/account/logout — clears the oppidx_subscriber cookie. The
 * client is also responsible for calling supabase.auth.signOut() to clear
 * the Supabase-side session; this route only handles oppidx's own cookie. */
export async function POST() {
  await destroySubscriberSession()
  return NextResponse.json({ ok: true })
}
