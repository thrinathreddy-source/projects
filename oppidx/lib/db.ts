// lib/db.ts

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient as createLibsqlClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Local dev: DATABASE_URL="file:./dev.db", no adapter needed.
// Production: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN set → connect to the
// hosted Turso database over its libsql client instead of a local file.
function createPrismaClient(): PrismaClient {
  if (process.env.TURSO_DATABASE_URL) {
    const libsql = createLibsqlClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    return new PrismaClient({ adapter: new PrismaLibSQL(libsql) })
  }
  return new PrismaClient()
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
