import "server-only";
import { prisma } from "./db";

/**
 * Install-wide settings, stored as key/value rows so an admin can change them
 * from the UI without a redeploy.
 */
export const DEFAULTS = {
  /** Minimum gap between automatic sync runs, in minutes. */
  syncIntervalMinutes: 360,
  /** Delay between consecutive LeetCode requests, in ms. Keeps runs polite. */
  leetcodeDelayMs: 350,
  /** Stop a run after this many members, so a bad config cannot hammer LeetCode. */
  maxMembersPerRun: 60,
} as const;

export type SettingKey = keyof typeof DEFAULTS;

const MIN_INTERVAL = 5;
const MAX_INTERVAL = 10_080; // 7 days
const MIN_DELAY = 0;
const MAX_DELAY = 5_000;

export type Settings = { [K in SettingKey]: number };

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const stored = new Map(rows.map((r) => [r.key, r.value]));

  const out = {} as Settings;
  for (const [key, fallback] of Object.entries(DEFAULTS) as [SettingKey, number][]) {
    const raw = stored.get(key);
    const parsed = raw === undefined ? NaN : Number(raw);
    out[key] = Number.isFinite(parsed) ? clamp(parsed, bounds(key).min, bounds(key).max) : fallback;
  }
  return out;
}

function bounds(key: SettingKey): { min: number; max: number } {
  switch (key) {
    case "syncIntervalMinutes":
      return { min: MIN_INTERVAL, max: MAX_INTERVAL };
    case "leetcodeDelayMs":
      return { min: MIN_DELAY, max: MAX_DELAY };
    case "maxMembersPerRun":
      return { min: 1, max: 500 };
  }
}

export async function setSetting(key: SettingKey, raw: string): Promise<Settings> {
  const { min, max } = bounds(key);
  const value = clamp(Number(raw), min, max).toString();
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  return getSettings();
}

export async function getLastCronRun(): Promise<Date | null> {
  const row = await prisma.setting.findUnique({
    where: { key: "lastCronRunAt" },
    select: { updatedAt: true },
  });
  return row?.updatedAt ?? null;
}

export async function markCronRun(at = new Date()): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "lastCronRunAt" },
    create: { key: "lastCronRunAt", value: at.toISOString() },
    update: { value: at.toISOString() },
  });
}

/**
 * The shared secret an external scheduler must present to /api/cron/sync.
 * Read from the environment rather than the settings table so it never ends up
 * in a database dump or the admin UI.
 */
export function cronSecret(): string | null {
  const value = process.env.CRON_SECRET?.trim();
  return value && value.length > 0 ? value : null;
}

/** Constant-time compare so the secret cannot be probed byte by byte. */
export function secretMatches(provided: string | null, expected: string | null): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
