/**
 * Single source of truth for authentication.
 *
 * OppIDX has exactly one account: the admin (site owner). Every
 * protected route/page calls `requireAuth()`, which verifies the signed
 * session cookie and looks the user up in Prisma. Returns null if not
 * authenticated.
 */

import { getSession } from './session'
import { prisma }     from './db'

export interface AuthUser {
  id:    string
  email: string
  name:  string | null
}

export async function requireAuth(): Promise<AuthUser | null> {
  let userId: string | null
  try {
    userId = await getSession()
  } catch {
    return null
  }
  if (!userId) return null

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, email: true, name: true },
  }).catch(() => null)

  return user
}
