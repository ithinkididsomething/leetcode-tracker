import "server-only";
import { prisma } from "./db";
import {
  fetchAllProblemMeta,
  fetchProblemBySlug,
  fetchProfileTotals,
  fetchRecentAccepted,
  LeetCodeError,
  RECENT_AC_LIMIT,
  type ProfileTotals,
} from "./leetcode";
import { getSettings, markCronRun } from "./settings";
import { supersededManualIds } from "./stats";

/**
 * Ids for solves an admin typed in by hand, which have no LeetCode submission
 * id. The prefix is how sync recognises them, so a real submission arriving
 * later for the same problem on the same day can replace the manual row instead
 * of double counting.
 */
export const MANUAL_SUBMISSION_PREFIX = "manual:";

/** Rebuild the problem catalogue at most once a week; it is ~4070 rows. */
const PROBLEMSET_TTL_MS = 7 * 86_400_000;
const CATALOGUE_MARKER = "__catalogue_refreshed_at__";
const CHUNK = 400;

async function catalogueIsStale(): Promise<boolean> {
  const marker = await prisma.problem.findUnique({
    where: { titleSlug: CATALOGUE_MARKER },
    select: { acceptanceRatePct: true },
  });
  if (!marker?.acceptanceRatePct) return true;
  return Date.now() - marker.acceptanceRatePct > PROBLEMSET_TTL_MS;
}

async function refreshCatalogue(): Promise<number> {
  const problems = await fetchAllProblemMeta();
  if (problems.length === 0) return 0;

  for (let i = 0; i < problems.length; i += CHUNK) {
    const chunk = problems.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((p) =>
        prisma.problem.upsert({
          where: { titleSlug: p.titleSlug },
          create: {
            titleSlug: p.titleSlug,
            title: p.title,
            questionNumber: p.questionFrontendId,
            difficulty: p.difficulty,
            topics: JSON.stringify(p.topics),
            acceptanceRatePct: p.acRate === null ? null : p.acRate * 100,
          },
          update: {
            title: p.title,
            questionNumber: p.questionFrontendId,
            difficulty: p.difficulty,
            topics: JSON.stringify(p.topics),
            acceptanceRatePct: p.acRate === null ? null : p.acRate * 100,
          },
        }),
      ),
    );
  }

  await prisma.problem.upsert({
    where: { titleSlug: CATALOGUE_MARKER },
    create: {
      titleSlug: CATALOGUE_MARKER,
      title: "catalogue refresh marker",
      questionNumber: "0",
      difficulty: "UNKNOWN",
      topics: "[]",
      acceptanceRatePct: Date.now(),
    },
    update: { acceptanceRatePct: Date.now() },
  });

  return problems.length;
}

/**
 * Makes sure every slug in the batch has a catalogue row with real difficulty
 * and topic tags, fetching them directly when the bulk catalogue does not cover
 * the problem yet.
 *
 * Placeholders (difficulty "UNKNOWN") are re-fetched too, so problems that
 * landed before their metadata was available get repaired on a later sync
 * rather than staying blank forever.
 */
async function ensureProblems(
  slugs: string[],
  titles: string[],
): Promise<number> {
  const unique = [...new Set(slugs)];
  if (unique.length === 0) return 0;

  const titleBySlug = new Map(unique.map((s, i) => [s, titles[i]]));
  const stored = await prisma.problem.findMany({
    where: { titleSlug: { in: unique } },
    select: { titleSlug: true, difficulty: true },
  });
  const storedBySlug = new Map(stored.map((p) => [p.titleSlug, p]));

  const needsWork = unique.filter((slug) => {
    const row = storedBySlug.get(slug);
    return !row || row.difficulty === "UNKNOWN";
  });
  if (needsWork.length === 0) return 0;

  let repaired = 0;
  for (const slug of needsWork) {
    const fallbackTitle = titleBySlug.get(slug) ?? slug;
    let meta = null;
    try {
      meta = await fetchProblemBySlug(slug);
    } catch {
      meta = null;
    }

    if (meta) {
      await prisma.problem.upsert({
        where: { titleSlug: slug },
        create: {
          titleSlug: slug,
          title: meta.title,
          questionNumber: meta.questionFrontendId,
          difficulty: meta.difficulty,
          topics: JSON.stringify(meta.topics),
          acceptanceRatePct: meta.acRate === null ? null : meta.acRate,
        },
        update: {
          title: meta.title,
          questionNumber: meta.questionFrontendId,
          difficulty: meta.difficulty,
          topics: JSON.stringify(meta.topics),
          acceptanceRatePct: meta.acRate === null ? null : meta.acRate,
        },
      });
    } else {
      // Keep the submission rather than dropping it; the next sync retries.
      await prisma.problem.upsert({
        where: { titleSlug: slug },
        create: {
          titleSlug: slug,
          title: fallbackTitle,
          questionNumber: "0",
          difficulty: "UNKNOWN",
          topics: "[]",
        },
        update: {},
      });
      continue;
    }
    repaired += 1;
  }

  return repaired;
}

export type MemberSyncResult = {
  memberId: string;
  displayName: string;
  leetcodeUsername: string;
  imported: number;
  total: number;
  profile: ProfileTotals | null;
  error: string | null;
};

export type MemberSyncOutcome = MemberSyncResult & { durationMs: number };

/**
 * Fetches the newest accepted submissions for one member and stores anything
 * not seen before.
 *
 * LeetCode only ever returns the most recent 20, so a member's early history
 * cannot be recovered after the fact. This accumulates instead: every run
 * keeps whatever falls inside that 20-row window, so stored history becomes
 * more complete the longer the app is left running. Running on a schedule is
 * what makes this work, because anything that rolls past the 20-row window
 * between runs is gone for good.
 */
export async function syncMember(memberId: string): Promise<MemberSyncResult> {
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    select: { id: true, displayName: true, leetcodeUsername: true },
  });

  // Resolve the account first. LeetCode answers a nonexistent username with an
  // empty submission list rather than an error, so without this check a renamed
  // or deleted account would look like a perfectly healthy profile that simply
  // has nothing to show, forever.
  const profile = await fetchProfileTotals(member.leetcodeUsername);
  if (!profile) {
    throw new LeetCodeError(
      `LeetCode has no user called "${member.leetcodeUsername}". The handle may have been renamed.`,
      "not_found",
    );
  }

  const recent = await fetchRecentAccepted(member.leetcodeUsername);
  const usable = recent
    .map((s) => ({ ...s, at: new Date(s.timestamp * 1000) }))
    .filter((s) => !Number.isNaN(s.at.getTime()));

  // Compare against known ids up front. An upsert's timestamps cannot tell us
  // whether a row was created, so we need a real id list.
  const known = await prisma.submission.findMany({
    where: { memberId: member.id, id: { in: usable.map((s) => s.id) } },
    select: { id: true },
  });
  const knownIds = new Set(known.map((k) => k.id));
  const fresh = usable.filter((s) => !knownIds.has(s.id));

  if (fresh.length > 0) {
    // A submission must point at a catalogue row, so make sure the problem
    // exists before inserting. Re-solving one problem yields several
    // submission rows, so the same slug can repeat within one batch.
    await ensureProblems(
      fresh.map((s) => s.titleSlug),
      fresh.map((s) => s.title),
    );

    // An admin may have already typed this solve in by hand, guessing at the
    // date. Now that LeetCode has handed us the real one, drop the manual row so
    // the same problem is not counted twice.
    const manual = await prisma.submission.findMany({
      where: {
        memberId: member.id,
        id: { startsWith: MANUAL_SUBMISSION_PREFIX },
        titleSlug: { in: [...new Set(fresh.map((s) => s.titleSlug))] },
      },
      select: { id: true, titleSlug: true, solvedAt: true },
    });
    const superseded = supersededManualIds(manual, fresh);
    if (superseded.length > 0) {
      await prisma.submission.deleteMany({ where: { id: { in: superseded } } });
    }

    // A concurrent sync can insert these ids between our existence check and
    // this write. P2002 means someone else won the race, and the end state is
    // still correct.
    try {
      await prisma.submission.createMany({
        data: fresh.map((s) => ({
          id: s.id,
          memberId: member.id,
          titleSlug: s.titleSlug,
          solvedAt: s.at,
        })),
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "P2002") throw err;
    }
  }

  // Repair problems still marked UNKNOWN, including any stored by an earlier
  // run before their metadata could be fetched.
  const stale = await prisma.submission.findMany({
    where: { memberId: member.id, problem: { difficulty: "UNKNOWN" } },
    select: { titleSlug: true, problem: { select: { title: true } } },
    distinct: ["titleSlug"],
  });
  if (stale.length > 0) {
    await ensureProblems(
      stale.map((s) => s.titleSlug),
      stale.map((s) => s.problem.title),
    );
  }

  const total = await prisma.submission.count({ where: { memberId: member.id } });

  await prisma.member.update({
    where: { id: member.id },
    data: { lastSyncedAt: new Date(), lastSyncError: null },
  });

  return {
    memberId: member.id,
    displayName: member.displayName,
    leetcodeUsername: member.leetcodeUsername,
    imported: fresh.length,
    total,
    profile,
    error: null,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SyncAllResult = {
  ran: boolean;
  skippedReason: string | null;
  attempted: number;
  succeeded: number;
  failed: number;
  totalImported: number;
  catalogueSize: number;
  durationMs: number;
  members: MemberSyncOutcome[];
};

/**
 * Syncs every active member, one at a time with a configurable pause between
 * requests.
 *
 * Sequential and rate limited on purpose: firing 50 profiles at LeetCode in
 * parallel is the fastest way to get the whole IP rate limited, which would
 * cost you the very history this app exists to collect.
 */
export async function syncAllMembers(options?: {
  force?: boolean;
  /** Only sync this member. Used by the admin "sync now" button. */
  memberId?: string;
}): Promise<SyncAllResult> {
  const started = Date.now();
  const settings = await getSettings();

  if (options?.memberId) {
    const outcome = await runOne(options.memberId);
    return {
      ran: true,
      skippedReason: null,
      attempted: 1,
      succeeded: outcome.error ? 0 : 1,
      failed: outcome.error ? 1 : 0,
      totalImported: outcome.imported,
      catalogueSize: await prisma.problem.count(),
      durationMs: Date.now() - started,
      members: [outcome],
    };
  }

  // Self-throttle: the external scheduler can fire as often as it likes, and
  // the configured interval decides what actually happens. This is what makes
  // the interval setting meaningful rather than advisory.
  if (!options?.force) {
    const last = await prisma.setting.findUnique({
      where: { key: "lastCronRunAt" },
      select: { updatedAt: true },
    });
    if (last) {
      const elapsed = Date.now() - last.updatedAt.getTime();
      const due = settings.syncIntervalMinutes * 60_000;
      if (elapsed < due) {
        const mins = Math.ceil((due - elapsed) / 60_000);
        return {
          ran: false,
          skippedReason: `Last run was less than ${settings.syncIntervalMinutes} min ago; next due in ~${mins} min.`,
          attempted: 0,
          succeeded: 0,
          failed: 0,
          totalImported: 0,
          catalogueSize: await prisma.problem.count(),
          durationMs: Date.now() - started,
          members: [],
        };
      }
    }
  }

  let catalogueSize = await prisma.problem.count();
  if (await catalogueIsStale()) {
    try {
      catalogueSize = await refreshCatalogue();
    } catch {
      // Whatever is already cached is still useful, so keep going and retry
      // the refresh on the next run.
    }
  }

  // Rotate by staleness, not by creation order. Taking the first N rows in
  // createdAt order would sync the same N profiles every run and starve
  // everyone past the cap forever. Ordering oldest-sync-first means the roster
  // works through itself, and profiles that have never synced (NULL) come first
  // because SQLite sorts NULLs ahead of any timestamp.
  const members = await prisma.member.findMany({
    where: { active: true },
    orderBy: [{ lastSyncedAt: "asc" }, { createdAt: "asc" }],
    take: settings.maxMembersPerRun,
    select: { id: true },
  });

  const outcomes: MemberSyncOutcome[] = [];
  for (const [i, m] of members.entries()) {
    if (i > 0 && settings.leetcodeDelayMs > 0) await sleep(settings.leetcodeDelayMs);
    outcomes.push(await runOne(m.id));
  }

  await markCronRun();

  return {
    ran: true,
    skippedReason: null,
    attempted: outcomes.length,
    succeeded: outcomes.filter((o) => !o.error).length,
    failed: outcomes.filter((o) => o.error).length,
    totalImported: outcomes.reduce((sum, o) => sum + o.imported, 0),
    catalogueSize,
    durationMs: Date.now() - started,
    members: outcomes,
  };
}

/** Syncs one member and records the failure on their row instead of throwing. */
async function runOne(memberId: string): Promise<MemberSyncOutcome> {
  const started = Date.now();
  try {
    const result = await syncMember(memberId);
    return { ...result, durationMs: Date.now() - started };
  } catch (err) {
    const message =
      err instanceof LeetCodeError ? err.message : "Unexpected sync failure.";
    await prisma.member
      .update({ where: { id: memberId }, data: { lastSyncError: message } })
      .catch(() => {});

    const member = await prisma.member
      .findUnique({
        where: { id: memberId },
        select: { displayName: true, leetcodeUsername: true },
      })
      .catch(() => null);

    return {
      memberId,
      displayName: member?.displayName ?? "(unknown)",
      leetcodeUsername: member?.leetcodeUsername ?? "",
      imported: 0,
      total: 0,
      profile: null,
      error: message,
      durationMs: Date.now() - started,
    };
  }
}

export { RECENT_AC_LIMIT };
