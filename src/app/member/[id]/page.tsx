import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildHeatmap,
  computeStreak,
  difficultyBreakdown,
  topicBreakdown,
  weeklyBuckets,
  weekTotal,
} from "@/lib/stats";
import { DifficultyChart, WeeklyChart } from "@/components/Charts";
import { Heatmap } from "@/components/Heatmap";

export const dynamic = "force-dynamic";

export default async function MemberPage({
  params,
}: PageProps<"/member/[id]">) {
  await requireAdmin();
  const { id } = await params;

  const member = await prisma.member.findUnique({
    where: { id },
    include: { team: { select: { name: true } } },
  });
  if (!member) notFound();

  const subs = await prisma.submission.findMany({
    where: { memberId: member.id },
    orderBy: { solvedAt: "desc" },
    select: {
      id: true,
      solvedAt: true,
      problem: {
        select: {
          title: true,
          questionNumber: true,
          difficulty: true,
          topics: true,
          titleSlug: true,
        },
      },
    },
  });

  const rows = subs.map((s) => ({
    solvedAt: s.solvedAt,
    difficulty: s.problem.difficulty,
    topics: s.problem.topics,
  }));

  const buckets = weeklyBuckets(rows);
  const streak = computeStreak(rows);
  const topics = topicBreakdown(rows, 8);
  const maxTopic = topics[0]?.count ?? 1;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/" className="text-xs text-ink-500 hover:underline">
        Back to standings
      </Link>

      <header className="card mb-6 mt-2 border-l-4 border-l-brand-500 p-4">
        <h1 className="text-xl font-semibold text-ink-900">
          {member.displayName}
          <span className="ml-2 text-sm font-normal text-ink-400">
            @{member.leetcodeUsername}
          </span>
        </h1>
        <p className="text-xs text-ink-500">
          {member.team.name} ·{" "}
          {member.lastSyncedAt
            ? `last synced ${member.lastSyncedAt.toLocaleString()}`
            : "never synced"}
          {member.lastSyncError && (
            <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700 ring-1 ring-red-200">
              {member.lastSyncError}
            </span>
          )}
        </p>
      </header>

      {subs.length === 0 ? (
        <p className="card p-8 text-center text-sm text-ink-400">
          Nothing tracked for this profile yet. LeetCode only exposes the 20 most
          recent accepted submissions, so the next scheduled run picks up what is
          still inside that window.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="This week" value={weekTotal(buckets)} />
            <Tile
              label="Current streak"
              value={`${streak.current}d`}
              hint={streak.activeToday ? "active today" : "not today yet"}
            />
            <Tile label="Longest streak" value={`${streak.longest}d`} />
            <Tile label="Tracked" value={subs.length} />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Card title="This week" className="lg:col-span-2">
              <WeeklyChart buckets={buckets} />
            </Card>
            <Card title="Difficulty">
              <DifficultyChart slices={difficultyBreakdown(rows)} />
            </Card>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Card title="Consistency" subtitle="Last 26 weeks" className="lg:col-span-2">
              <Heatmap heatmap={buildHeatmap(rows, 26)} />
            </Card>
            <Card title="Top topics">
              <ul className="space-y-2">
                {topics.map((t) => (
                  <li key={t.topic}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate text-ink-700">{t.topic}</span>
                      <span className="ml-2 shrink-0 text-ink-500 tabular-nums">
                        {t.count}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${(t.count / maxTopic) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card title="Recent problems" className="mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs text-ink-500">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Problem</th>
                    <th className="py-2 pr-3 font-medium">Difficulty</th>
                    <th className="py-2 font-medium">Solved</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.slice(0, 40).map((s) => (
                    <tr key={s.id} className="border-b border-ink-100 last:border-0">
                      <td className="py-2 pr-3 text-ink-400 tabular-nums">
                        {s.problem.questionNumber === "0" ? "-" : s.problem.questionNumber}
                      </td>
                      <td className="py-2 pr-3">
                        <a
                          href={`https://leetcode.com/problems/${s.problem.titleSlug}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-ink-800 hover:underline"
                        >
                          {s.problem.title}
                        </a>
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            s.problem.difficulty === "EASY"
                              ? "text-emerald-600"
                              : s.problem.difficulty === "MEDIUM"
                                ? "text-amber-600"
                                : s.problem.difficulty === "HARD"
                                  ? "text-red-600"
                                  : "text-ink-400"
                          }
                        >
                          {s.problem.difficulty === "UNKNOWN"
                            ? "—"
                            : s.problem.difficulty[0] + s.problem.difficulty.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="py-2 text-xs whitespace-nowrap text-ink-500">
                        {s.solvedAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </main>
  );
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-ink-900 tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`card p-4 ${className}`}>
      <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
