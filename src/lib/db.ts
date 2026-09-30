import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * Next runs with cwd set to the project root, so a relative SQLite path lands
 * on the same file that prisma.config.ts anchors to an absolute path. The CLI
 * is the side that needed pinning, because it resolves relative paths against
 * its own config directory instead.
 */
function databaseUrl(): string {
  return process.env.DATABASE_URL ?? "file:./dev.db";
}

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl() });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
