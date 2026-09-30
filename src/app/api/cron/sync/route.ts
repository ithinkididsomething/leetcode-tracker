import { NextResponse } from "next/server";
import { syncAllMembers } from "@/lib/sync";
import { cronSecret, secretMatches } from "@/lib/settings";

// A scheduled job can fire far more often than the configured interval, and
// each run talks to LeetCode. Skip the framework cache for this route.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Entry point for an external scheduler.
 *
 * Authenticate with the shared secret:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://host/api/cron/sync
 *
 * Set `?force=1` to bypass the interval throttle (useful after adding members
 * or for a manual check). The run self-throttles to the configured interval
 * otherwise, so hammering this endpoint is harmless.
 */
export async function GET(req: Request) {
  const configured = cronSecret();
  if (!configured) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set. Sync is disabled." },
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!secretMatches(provided, configured)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  try {
    const result = await syncAllMembers({ force });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("cron sync failed", err);
    return NextResponse.json(
      { error: "Sync failed unexpectedly." },
      { status: 500 },
    );
  }
}

export const POST = GET;
