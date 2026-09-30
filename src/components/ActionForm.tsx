"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/admin/actions";

const INITIAL: FormState = { ok: false, message: "" };

/**
 * Wraps a Server Action with the pending/error state that every admin form
 * needs, so each form does not have to reimplement it.
 *
 * The action is handed to `useActionState` unwrapped on purpose. Wrapping it in
 * a local closure would make the form's action a client-side function, which
 * React cannot serialise into the server-rendered HTML, and the form element's
 * action attributes then disagree between the server and client passes.
 */
export function ActionForm({
  action,
  children,
  className = "",
  submitLabel = "Save",
  pendingLabel = "Working...",
  hideMessage = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  submitLabel?: string;
  pendingLabel?: string;
  hideMessage?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className={className}>
      {children}
      {state.message && !hideMessage && (
        <p
          className={`mt-2 rounded-md border px-3 py-2 text-sm ${
            state.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 btn btn-primary"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
