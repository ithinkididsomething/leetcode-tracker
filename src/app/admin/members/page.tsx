import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addMemberAction, deleteMemberAction, updateMemberAction } from "@/app/admin/actions";
import { ActionForm } from "@/components/ActionForm";

export const dynamic = "force-dynamic";

function teamSelect(
  name: string,
  teams: { id: string; name: string }[],
  defaultId?: string,
) {
  return (
    <select
      name={name}
      defaultValue={defaultId}
      className="field w-auto"
    >
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

export default async function MembersPage() {
  await requireAdmin();

  const [teams, members] = await Promise.all([
    prisma.team.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.member.findMany({
      orderBy: [{ team: { sortOrder: "asc" } }, { createdAt: "asc" }],
      include: {
        team: { select: { name: true } },
        _count: { select: { submissions: true } },
      },
    }),
  ]);

  const teamList = teams.map((t) => ({ id: t.id, name: t.name }));

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-xl font-semibold text-ink-900">Members</h1>
      <p className="mt-1 text-xs text-ink-500">
        Tracked LeetCode profiles. These are records, not logins.
      </p>

      <section className="mt-6 card p-4">
        <h2 className="text-sm font-semibold text-ink-900">Add a profile</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          The username is checked against LeetCode, then history is imported
          immediately.
        </p>

        {teamList.length === 0 ? (
          // Every team has been removed, so there is nothing to assign a
          // profile to. An empty <select> here would just submit a blank teamId.
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            There are no teams yet.{" "}
            <Link href="/admin/teams" className="font-semibold underline underline-offset-2">
              Create one
            </Link>{" "}
            before adding profiles.
          </p>
        ) : (
          <ActionForm action={addMemberAction} submitLabel="Add and sync" className="mt-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                name="displayName"
                required
                maxLength={60}
                placeholder="Display name"
                className="field"
              />
              <input
                name="leetcodeUsername"
                required
                placeholder="LeetCode username"
                pattern="[a-zA-Z0-9_\-]{2,30}"
                title="2-30 letters, numbers, hyphens or underscores"
                className="field"
              />
              {teamSelect("teamId", teamList)}
            </div>
          </ActionForm>
        )}
      </section>

      <h2 className="mt-8 text-sm font-semibold text-ink-900">
        Tracked profiles ({members.length})
      </h2>

      {members.length === 0 ? (
        <p className="mt-3 card p-8 text-center text-sm text-ink-400">
          Nothing tracked yet.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="card p-4"
            >
              <ActionForm action={updateMemberAction} submitLabel="Save" hideMessage>
                <input type="hidden" name="memberId" value={m.id} />
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    name="displayName"
                    defaultValue={m.displayName}
                    required
                    maxLength={60}
                    aria-label="Display name"
                    className="min-w-40 flex-1 field"
                  />
                  <span className="text-xs text-ink-400">@{m.leetcodeUsername}</span>
                  {teamSelect("teamId", teamList, m.teamId)}
                  <label className="flex items-center gap-1.5 text-xs text-ink-600">
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={m.active}
                      className="rounded"
                    />
                    active
                  </label>
                </div>
                <p className="mt-2 text-xs text-ink-400">
                  {m._count.submissions} tracked ·{" "}
                  {m.lastSyncedAt
                    ? `synced ${m.lastSyncedAt.toLocaleString()}`
                    : "never synced"}
                  {m.lastSyncError && (
                    <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700 ring-1 ring-red-200">last error: {m.lastSyncError}</span>
                  )}
                </p>
              </ActionForm>

              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-ink-400 hover:text-ink-700">
                  Remove permanently
                </summary>
                <div className="mt-2">
                  <ActionForm
                    action={deleteMemberAction}
                    submitLabel="Delete profile and all tracked history"
                    pendingLabel="Deleting..."
                  >
                    <input type="hidden" name="memberId" value={m.id} />
                    <p className="text-xs text-ink-500">
                      This drops {m._count.submissions} stored submissions for{" "}
                      {m.displayName}. To stop syncing them instead, untick{" "}
                      <span className="font-medium">active</span> above and save.
                    </p>
                  </ActionForm>
                </div>
              </details>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
