import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  changePasswordAction,
  createAdminAction,
  deleteAdminAction,
} from "@/app/admin/actions";
import { ActionForm } from "@/components/ActionForm";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const me = await requireAdmin();

  const admins = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      _count: { select: { sessions: true } },
    },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-ink-900">Admin accounts</h1>
      <p className="mt-1 text-xs text-ink-500">
        Everyone here can sign in and edit teams, members and settings. Tracked
        LeetCode profiles are separate and never need an account.
      </p>

      <section className="card mt-6 p-4">
        <h2 className="text-sm font-semibold text-ink-900">Add an admin</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Share the password over a channel you trust; it is stored only as a
          bcrypt hash and cannot be displayed again.
        </p>
        <ActionForm action={createAdminAction} submitLabel="Create account">
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              id="new-admin-email"
              name="email"
              type="email"
              label="Email"
              autoComplete="off"
              required
            />
            <Field id="new-admin-name" name="name" label="Display name" />
            <Field
              id="new-admin-password"
              name="password"
              type="password"
              label="Password"
              autoComplete="new-password"
              required
            />
            <Field
              id="new-admin-confirm"
              name="confirmPassword"
              type="password"
              label="Confirm password"
              autoComplete="new-password"
              required
            />
          </div>
        </ActionForm>
      </section>

      <section className="card mt-6 p-4">
        <h2 className="text-sm font-semibold text-ink-900">
          Accounts ({admins.length})
        </h2>
        <ul className="mt-3 divide-y divide-ink-100">
          {admins.map((admin) => (
            <li
              key={admin.id}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">
                  {admin.name}
                  {admin.id === me.id && (
                    <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200">
                      you
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-ink-500">{admin.email}</p>
                <p className="text-[11px] text-ink-400">
                  added {admin.createdAt.toLocaleDateString()} ·{" "}
                  {admin._count.sessions} active session
                  {admin._count.sessions === 1 ? "" : "s"}
                </p>
              </div>

              {admin.id === me.id ? (
                <p className="text-xs text-ink-400">Current account</p>
              ) : (
                <ActionForm
                  action={deleteAdminAction}
                  submitLabel="Remove"
                  pendingLabel="Removing..."
                >
                  <input type="hidden" name="userId" value={admin.id} />
                  <button
                    type="submit"
                    className="text-xs font-medium text-red-600 underline decoration-red-300 underline-offset-2 hover:text-red-700"
                  >
                    Remove
                  </button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-6 border-l-4 border-l-brand-500 p-4">
        <h2 className="text-sm font-semibold text-ink-900">Change your password</h2>
        <ActionForm
          action={changePasswordAction}
          submitLabel="Update password"
          className="mt-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="current-password"
              name="currentPassword"
              type="password"
              label="Current password"
              autoComplete="current-password"
              required
            />
            <div />
            <Field
              id="next-password"
              name="password"
              type="password"
              label="New password"
              autoComplete="new-password"
              required
            />
            <Field
              id="next-password-confirm"
              name="confirmPassword"
              type="password"
              label="Confirm new password"
              autoComplete="new-password"
              required
            />
          </div>
        </ActionForm>
      </section>
    </main>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  required,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-500">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className="w-full field"
      />
    </div>
  );
}