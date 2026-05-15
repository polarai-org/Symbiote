import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { getSqliteUrl } from "@symbiote/config"
import { PrismaClient } from "./generated/prisma/client"

const adapter = new PrismaBetterSqlite3({
  url: getSqliteUrl(),
})

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
