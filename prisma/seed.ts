import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

/**
 * Placeholder names so the standings are usable immediately. Every one of
 * these is meant to be overwritten from the admin UI, and admins can add or
 * remove teams from there too, so this is a starting point rather than a fixed
 * roster.
 */
const PRESET_TEAM_NAMES = ["Team A", "Team B", "Team C", "Team D", "Team E"];

async function seedTeams() {
  const existing = await prisma.team.count();
  if (existing > 0) {
    console.log(`teams: ${existing} already present, skipping`);
    return;
  }

  for (const [i, name] of PRESET_TEAM_NAMES.entries()) {
    await prisma.team.create({ data: { name, sortOrder: i } });
  }
  console.log(`teams: created ${PRESET_TEAM_NAMES.length} presets`);
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Admin";

  if (!email || !password) {
    console.log(
      "admin: skipped (set ADMIN_EMAIL and ADMIN_PASSWORD in .env to create one)",
    );
    return;
  }

  if (password.length < 8) {
    console.log("admin: skipped (ADMIN_PASSWORD must be at least 8 characters)");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`admin: ${email} already exists, skipping`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name,
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`admin: created ${email}`);
}

async function main() {
  await seedTeams();
  await seedAdmin();
  await prisma.$disconnect();
}

void main();
