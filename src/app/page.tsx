import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { buildBoard } from "@/lib/leaderboard";
import { getSettings } from "@/lib/settings";
import { SyncNowButton } from "@/components/SyncNowButton";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-ink-900 tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

export default async function BoardPage() {
  await requireAdmin();
  const [board, settings] = await Promise.all([buildBoard(), getSettings()]);

  const ranked = [...board.teams].sort(
    (a, b) => b.thisWeek - a.thisWeek || b.total - a.total,
  );
  const leader = ranked[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Standings</h1>
          <p className="text-xs text-ink-500">
            Problems solved since Monday · auto-syncs every{" "}
            {settings.syncIntervalMinutes >= 60
              ? `${Math.round((settings.syncIntervalMinutes / 60) * 10) / 10}h`
              : `${settings.syncIntervalMinutes}m`}
            {board.lastCronRun
              ? ` · last run ${board.lastCronRun.toLocaleString()}`
              : " · not run yet"}
          </p>
        </div>
        <div className="ml-auto">
          <SyncNowButton />
        </div>
      </header>

      {board.trackedProfiles === 0 ? (
        <EmptyBoard />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="This week" value={board.thisWeek} hint="Across all teams" />
            <Stat label="All tracked" value={board.total} hint="Submissions stored" />
            <Stat
              label="Profiles"
              value={board.trackedProfiles}
              hint="LeetCode accounts"
            />
            <Stat
              label="Sync failures"
              value={board.failures}
              hint={board.failures === 0 ? "All healthy" : "Needs attention"}
            />
          </div>

          {board.failures > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-100">
              <p className="font-medium">
                {board.failures} {board.failures === 1 ? "profile" : "profiles"} failed
                its last sync
              </p>
              <p className="mt-1 text-amber-800">
                A LeetCode username that no longer exists will fail every run. Fix the
                handle in Members, or deactivate the profile to stop retrying it.
              </p>
            </div>
          )}

          <div className="mt-4 space-y-4">
            {ranked.map((team, i) => {
              const accent = TEAM_ACCENTS[team.sortOrder % TEAM_ACCENTS.length];
              return (
              <section
                key={team.teamId}
                className="card overflow-hidden"
              >
                {/* A coloured spine down the left edge identifies the team at a
                    glance, so the blocks stay distinguishable even when every one
                    of them is a white table. */}
                <div
                  className={`flex flex-wrap items-center gap-3 border-b border-ink-200 px-4 py-3 ${accent.bar}`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${accent.rank}`}
                  >
                    {i + 1}
                  </span>
                  <h2 className={`text-sm font-semibold ${accent.text}`}>{team.name}</h2>
                  <span className="text-xs text-ink-500">
                    {team.thisWeek} this week · {team.total} tracked ·{" "}
                    {team.activeDays} active · avg {team.avgPerMember}/member
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink-700 tabular-nums ring-1 ring-ink-200">
                      {team.thisWeek} this week
                    </span>
                  </span>
                </div>

                {team.members.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-ink-400">
                    No members in this team yet.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink-100 text-left text-xs text-ink-400">
                        <th className="px-4 py-2 font-medium">Member</th>
                        <th className="px-4 py-2 text-right font-medium">Week</th>
                        <th className="px-4 py-2 text-right font-medium">Streak</th>
                        <th className="px-4 py-2 text-right font-medium">Total</th>
                        <th className="px-4 py-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.members.map((m) => (
                        <tr
                          key={m.memberId}
                          className="border-b border-ink-100 transition-colors last:border-0 hover:bg-ink-50/70"
                        >
                          <td className="px-4 py-2">
                            <span
                              aria-hidden
                              className={`mr-2 inline-block h-2 w-2 shrink-0 rounded-full align-middle ${accent.dot}`}
                            />
                            <Link
                              href={`/member/${m.memberId}`}
                              className={`font-medium hover:underline ${accent.link}`}
                            >
                              {m.displayName}
                            </Link>
                            <span className="ml-2 text-xs text-ink-400">
                              @{m.leetcodeUsername}
                            </span>
                            {!m.lastSyncedAt && (
                              <span className="ml-2 text-xs text-amber-600">never synced</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right text-base font-semibold text-ink-900 tabular-nums">
                            {m.thisWeek}
                          </td>
                          <td className="px-4 py-2 text-right text-ink-600 tabular-nums">
                            {m.streak}d
                          </td>
                          <td className="px-4 py-2 text-right text-ink-600 tabular-nums">
                            {m.total}
                          </td>
                          <td className="px-4 py-2 text-right text-xs">
                            {m.lastSyncError ? (
                              <span
                                title={m.lastSyncError}
                                className="inline-block rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700 ring-1 ring-red-200"
                              >
                                failed
                              </span>
                            ) : m.lastSyncedAt ? (
                              <span className="text-ink-400">
                                {m.lastSyncedAt.toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-amber-200">
                                pending
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
              );
            })}
          </div>

          {leader && leader.members.length === 0 && (
            <p className="mt-4 text-center text-sm text-ink-400">
              Add members to {leader.name} to start tracking.
            </p>
          )}
        </>
      )}
    </main>
  );
}

/*
 * One accent per team, assigned by sortOrder so a team's colour is stable
 * across renders. Distinct hues and distinct lightness values, so the blocks stay
 * separable for colour-blind readers and in greyscale print.
 *
 * Teams beyond this list reuse the palette via modulo. Two teams sharing a hue
 * is a mild cosmetic repeat, which is a better trade than colours that reshuffle
 * every time someone is added.
 */
const TEAM_ACCENTS = [
  { bar: "bg-violet-50/70", dot: "bg-violet-500", rank: "bg-violet-600 text-white", text: "text-violet-900", link: "text-violet-800" },
  { bar: "bg-sky-50/70", dot: "bg-sky-500", rank: "bg-sky-600 text-white", text: "text-sky-900", link: "text-sky-800" },
  { bar: "bg-teal-50/70", dot: "bg-teal-500", rank: "bg-teal-600 text-white", text: "text-teal-900", link: "text-teal-800" },
  { bar: "bg-amber-50/70", dot: "bg-amber-500", rank: "bg-amber-600 text-white", text: "text-amber-900", link: "text-amber-800" },
  { bar: "bg-rose-50/70", dot: "bg-rose-500", rank: "bg-rose-600 text-white", text: "text-rose-900", link: "text-rose-800" },
  { bar: "bg-indigo-50/70", dot: "bg-indigo-500", rank: "bg-indigo-600 text-white", text: "text-indigo-900", link: "text-indigo-800" },
  { bar: "bg-lime-50/70", dot: "bg-lime-500", rank: "bg-lime-600 text-white", text: "text-lime-900", link: "text-lime-800" },
  { bar: "bg-fuchsia-50/70", dot: "bg-fuchsia-500", rank: "bg-fuchsia-600 text-white", text: "text-fuchsia-900", link: "text-fuchsia-800" },
] as const;

function EmptyBoard() {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19V5a1 1 0 0 1 1-1h11l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
          <path d="M15 4v5h5" />
          <path d="M8 13l2.5 2.5L16 10" />
        </svg>
      </div>
      <h2 className="mt-4 text-sm font-semibold text-ink-900">No profiles yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
        Add members by their public LeetCode username. Each profile is verified
        against LeetCode when you add it, then synced on a schedule.
      </p>
      <Link
        href="/admin/members"
        className="btn btn-primary mt-5"
      >
        Add members
      </Link>
    </div>
  );
}
