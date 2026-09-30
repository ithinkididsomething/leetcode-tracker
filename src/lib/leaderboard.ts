import "server-only";
import { prisma } from "./db";
import { computeStreak, startOfWeek, addDays, dayKey, type SolvedRow } from "./stats";

export type MemberStanding = {
  memberId: string;
  displayName: string;
  leetcodeUsername: string;
  teamId: string;
  thisWeek: number;
  total: number;
  streak: number;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
};

export type TeamStanding = {
  teamId: string;
  name: string;
  sortOrder: number;
  thisWeek: number;
  total: number;
  activeDays: number;
  avgPerMember: number;
  members: MemberStanding[];
};

export type Board = {
  teams: TeamStanding[];
  thisWeek: number;
  total: number;
  trackedProfiles: number;
  failures: number;
  lastCronRun: Date | null;
};

/**
 * Builds the standings board, ranked by this week's count within each team.
 *
 * Ranking uses locally stored submissions rather than live LeetCode data, so it
 * reflects what has actually been synced instead of penalising anyone whose
 * profile happened not to sync on the same schedule as everyone else's.
 */
export async function buildBoard(): Promise<Board> {
  const [teams, members, subs, lastCron] = await Promise.all([
    prisma.team.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.member.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.submission.findMany({
      select: {
        memberId: true,
        solvedAt: true,
        problem: { select: { difficulty: true, topics: true } },
      },
    }),
    prisma.setting.findUnique({
      where: { key: "lastCronRunAt" },
      select: { updatedAt: true },
    }),
  ]);

  const weekStart = startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 7);
  const weekStartKey = dayKey(weekStart);

  const weekCounts = new Map<string, number>();
  const totalCounts = new Map<string, number>();
  const rowsByMember = new Map<string, SolvedRow[]>();

  for (const s of subs) {
    totalCounts.set(s.memberId, (totalCounts.get(s.memberId) ?? 0) + 1);

    const list = rowsByMember.get(s.memberId) ?? [];
    list.push({
      solvedAt: s.solvedAt,
      difficulty: s.problem.difficulty,
      topics: s.problem.topics,
    });
    rowsByMember.set(s.memberId, list);

    if (dayKey(s.solvedAt) >= weekStartKey && s.solvedAt < weekEnd) {
      weekCounts.set(s.memberId, (weekCounts.get(s.memberId) ?? 0) + 1);
    }
  }

  const standings: MemberStanding[] = members.map((m) => ({
    memberId: m.id,
    displayName: m.displayName,
    leetcodeUsername: m.leetcodeUsername,
    teamId: m.teamId,
    thisWeek: weekCounts.get(m.id) ?? 0,
    total: totalCounts.get(m.id) ?? 0,
    streak: computeStreak(rowsByMember.get(m.id) ?? []).current,
    lastSyncedAt: m.lastSyncedAt,
    lastSyncError: m.lastSyncError,
  }));

  const byTeam = new Map<string, MemberStanding[]>();
  for (const s of standings) {
    const list = byTeam.get(s.teamId) ?? [];
    list.push(s);
    byTeam.set(s.teamId, list);
  }

  const teamStandings: TeamStanding[] = teams.map((t) => {
    const list = (byTeam.get(t.id) ?? []).sort(
      (a, b) =>
        b.thisWeek - a.thisWeek ||
        b.streak - a.streak ||
        b.total - a.total ||
        a.displayName.localeCompare(b.displayName),
    );
    const thisWeek = list.reduce((sum, m) => sum + m.thisWeek, 0);
    const total = list.reduce((sum, m) => sum + m.total, 0);

    return {
      teamId: t.id,
      name: t.name,
      sortOrder: t.sortOrder,
      thisWeek,
      total,
      activeDays: list.filter((m) => m.thisWeek > 0).length,
      avgPerMember: list.length === 0 ? 0 : Math.round((thisWeek / list.length) * 10) / 10,
      members: list,
    };
  });

  return {
    teams: teamStandings,
    thisWeek: teamStandings.reduce((sum, t) => sum + t.thisWeek, 0),
    total: teamStandings.reduce((sum, t) => sum + t.total, 0),
    trackedProfiles: members.length,
    failures: standings.filter((m) => m.lastSyncError).length,
    lastCronRun: lastCron?.updatedAt ?? null,
  };
}
