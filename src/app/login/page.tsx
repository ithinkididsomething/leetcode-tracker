import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loginAction } from "@/app/admin/actions";
import { ActionForm } from "@/components/ActionForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Soft brand wash so the sign-in screen is not a white void. Purely
          decorative, and hidden from assistive tech. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute -bottom-40 right-1/4 h-80 w-80 rounded-full bg-sky-200/40 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm shadow-brand-600/30">
            LT
          </span>
          <h1 className="mt-3 text-center text-lg font-semibold text-ink-900">
            LeetCode Tracker
          </h1>
          <p className="mt-1 text-center text-xs text-ink-500">
            Admin sign in. Tracked members do not have accounts.
          </p>
        </div>

        <div className="card mt-6 p-5">
          <ActionForm
            action={loginAction}
            submitLabel="Sign in"
            pendingLabel="Signing in..."
          >
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-600">
                Email
              </span>
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                className="field"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-ink-600">
                Password
              </span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="field"
              />
            </label>
          </ActionForm>
        </div>

        <p className="mt-4 text-center text-xs text-ink-400">
          First run? Create the admin with{" "}
          <code className="font-mono text-ink-600">npm run db:seed</code> using{" "}
          <code className="font-mono text-ink-600">ADMIN_EMAIL</code> and{" "}
          <code className="font-mono text-ink-600">ADMIN_PASSWORD</code>.
        </p>
      </div>
    </main>
  );
}
