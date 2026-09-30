import { requireAdmin } from "@/lib/auth";
import { cronSecret, getLastCronRun, getSettings } from "@/lib/settings";
import { updateSettingsAction } from "@/app/admin/actions";
import { ActionForm } from "@/components/ActionForm";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function Field({
  name,
  label,
  hint,
  defaultValue,
  min,
  max,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: number;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-ink-800">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        defaultValue={defaultValue}
        min={min}
        max={max}
        required
        className="w-40 field"
      />
      <p className="mt-1 text-xs text-ink-500">{hint}</p>
    </div>
  );
}

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, lastRun, memberCount] = await Promise.all([
    getSettings(),
    getLastCronRun(),
    prisma.member.count({ where: { active: true } }),
  ]);

  const secret = cronSecret();
  const profiles = await prisma.problem.count();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-semibold text-ink-900">Settings</h1>
      <p className="mt-1 text-xs text-ink-500">
        Applies to the whole install.
      </p>

      <section className="mt-6 card p-4">
        <h2 className="text-sm font-semibold text-ink-900">Sync</h2>
        <ActionForm action={updateSettingsAction} className="mt-3 space-y-4">
          <Field
            name="syncIntervalMinutes"
            label="Minimum minutes between runs"
            hint="The cron endpoint skips itself until this much time has passed, so you can schedule it every 5 minutes and still only hit LeetCode this often. Minimum 5."
            defaultValue={settings.syncIntervalMinutes}
            min={5}
            max={10080}
          />
          <Field
            name="leetcodeDelayMs"
            label="Delay between profiles (ms)"
            hint="Sequential scraping with a pause. Raising this is the simplest way to avoid a rate limit. 0-5000."
            defaultValue={settings.leetcodeDelayMs}
            min={0}
            max={5000}
          />
          <Field
            name="maxMembersPerRun"
            label="Max profiles per run"
            hint="Caps each run so a large roster cannot hammer LeetCode in one burst. 1-500."
            defaultValue={settings.maxMembersPerRun}
            min={1}
            max={500}
          />
        </ActionForm>
      </section>

      <section className="mt-4 card p-4">
        <h2 className="text-sm font-semibold text-ink-900">Scheduled sync</h2>
        {!secret ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="font-medium">CRON_SECRET is not set.</span> The cron
            endpoint is disabled and returns 503. Add it to .env and restart.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-600">
              Point any scheduler at this endpoint with the secret as a bearer token:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-900 p-3.5 text-xs leading-relaxed text-ink-100 ring-1 ring-ink-800">
{`curl -H "Authorization: Bearer $CRON_SECRET" \\
  http://localhost:3000/api/cron/sync

# bypass the interval throttle
curl -H "Authorization: Bearer $CRON_SECRET" \\
  "http://localhost:3000/api/cron/sync?force=1"`}
            </pre>
            <p className="mt-2 text-xs text-ink-500">
              The secret lives in <span className="font-mono">.env</span> and is never
              shown in the UI or stored in the database.
            </p>
          </>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Stat label="Last run" value={lastRun ? lastRun.toLocaleString() : "never"} />
          <Stat label="Active profiles" value={String(memberCount)} />
          <Stat label="Problem catalogue" value={String(profiles)} />
          <Stat
            label="Next due"
            value={
              lastRun
                ? new Date(
                    lastRun.getTime() + settings.syncIntervalMinutes * 60_000,
                  ).toLocaleString()
                : "immediately"
            }
          />
        </dl>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-200 bg-ink-50 px-2 py-1.5">
      <dt className="text-ink-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink-800">{value}</dd>
    </div>
  );
}
