"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { syncNowAction } from "@/app/admin/actions";

/** Fires the same sync path the cron endpoint uses, on demand from the UI. */
export function SyncNowButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={() =>
          startTransition(async () => {
            const result = await syncNowAction();
            setMessage({ ok: result.ok, text: result.message });
            if (result.ok) router.refresh();
          })
        }
        disabled={pending}
        className="btn btn-primary"
      >
        {pending ? "Syncing..." : "Sync all now"}
      </button>
      {message && (
        <p
          className={`mt-1 max-w-72 text-right text-xs ${
            message.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
