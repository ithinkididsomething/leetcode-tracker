import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createTeamAction,
  deleteTeamAction,
  renameTeamAction,
} from "@/app/admin/actions";
import { ActionForm } from "@/components/ActionForm";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  await requireAdmin();

  const teams = await prisma.team.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { members: true } } },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-ink-900">Teams</h1>
      <p className="mt-1 text-xs text-ink-500">
        Add teams with the + button and rename them below.
      </p>

      <AddTeamForm nextNumber={teams.length + 1} />

      <div className="mt-6 space-y-3">
        {teams.map((team) => (
          <div key={team.id} className="card p-4">
            <ActionForm
              action={renameTeamAction}
              submitLabel="Rename"
              hideMessage
            >
              <input type="hidden" name="teamId" value={team.id} />
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1">
                  <label
                    htmlFor={`name-${team.id}`}
                    className="mb-1 block text-xs font-medium text-ink-500"
                  >
                    Team name
                  </label>
                  <input
                    id={`name-${team.id}`}
                    name="name"
                    defaultValue={team.name}
                    required
                    maxLength={40}
                    className="w-full field"
                  />
                </div>
                <div className="pb-1.5 text-xs text-ink-400">
                  {team._count.members}{" "}
                  {team._count.members === 1 ? "member" : "members"}
                </div>
              </div>
            </ActionForm>

            {/* Only offered for empty teams. Deleting a team with members would
                cascade to their tracked submissions. */}
            {team._count.members === 0 && (
              <ActionForm
                action={deleteTeamAction}
                submitLabel="Delete"
                className="mt-3 border-t border-ink-100 pt-3"
                pendingLabel="Deleting..."
              >
                <input type="hidden" name="teamId" value={team.id} />
                <button
                  type="submit"
                  className="text-xs font-medium text-red-600 underline decoration-red-300 underline-offset-2 hover:text-red-700"
                >
                  Delete this empty team
                </button>
              </ActionForm>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

/**
 * The "+" control. One press adds a team named for its position, so the common
 * case needs no typing; typing a name overrides that before submitting.
 */
function AddTeamForm({ nextNumber }: { nextNumber: number }) {
  return (
    <ActionForm
      action={createTeamAction}
      submitLabel="+ Add team"
      pendingLabel="Adding..."
      className="card mt-6 border-dashed border-brand-200 bg-brand-50/50 p-4"
    >
      <label htmlFor="new-team" className="mb-1 block text-xs font-medium text-ink-600">
        New team name{" "}
        <span className="font-normal text-ink-400">
          (optional — defaults to Team {nextNumber})
        </span>
      </label>
      <div className="flex flex-wrap gap-3">
        <input
          id="new-team"
          name="name"
          placeholder={`Team ${nextNumber}`}
          maxLength={40}
          className="min-w-48 flex-1 field"
        />
      </div>
    </ActionForm>
  );
}