import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// Prisma resolves a relative SQLite path against this config's own directory,
// while the runtime driver adapter resolves it against process.cwd(). Those can
// differ, which silently points the CLI and the app at two different
// databases. Anchoring to an absolute path keeps them on the same file.
const root = path.dirname(fileURLToPath(import.meta.url));

function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  if (!raw.startsWith("file:")) return raw;
  const target = raw.slice("file:".length);
  if (path.isAbsolute(target)) return target;
  return `file:${path.resolve(root, target)}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
