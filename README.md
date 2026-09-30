# LeetCode Tracker

An admin-only board that tracks LeetCode solving across your teams. Admins
log in; the people on the board do not. Profiles are added as records, synced
automatically, and ranked by what they solved this week.

## Setup

```bash
npm install
```

```ini
cp .env.example .env    # then edit it, see .env.example for what each var does
```

Key variables (full detail and comments in `.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite location, e.g. `file:./dev.db` |
| `CRON_SECRET` | Bearer token for `/api/cron/sync` |
| `ADMIN_EMAIL` | Bootstrap admin login |
| `ADMIN_PASSWORD` | Bootstrap admin password (min 8 chars) |
| `ADMIN_NAME` | Bootstrap admin display name |

Then:

```bash
npm run db:setup   # migrate + generate client + seed 5 teams and the admin
npm run dev
```

Sign in at http://localhost:3000 with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. There is
no sign-up page: the accounts in the database are the only accounts.

## Before deploying

Everything here is server-rendered (`next build` reports all 10 routes as
`ƒ (Dynamic)`), so this **cannot** be shipped as static files. Netlify Drop and
Vercel Drop only accept static output and will not run it.

Four things to sort out, in order of how quietly they break things:

1. **SQLite needs a real, persistent disk.** `dev.db` is a single local file.
   Hosts with an ephemeral or read-only filesystem (Vercel, Netlify, most
   serverless) will silently lose every team, member and submission on the next
   deploy or redeploy. You need either a VPS / container host with a mounted
   volume, or a move to a hosted Postgres.
2. **`DATABASE_URL` must be absolute when deployed** — `file:/data/dev.db`, not
   `file:./dev.db`. See `.env.example` for why the relative form splits the
   database.
3. **Run `npm run db:setup` on the host.** It is `prisma migrate deploy` +
   `generate` + `seed`, and the seed skips teams and admins that already exist,
   so it is safe on every deploy.
4. **The sync endpoint needs a scheduler that can set headers.** It requires
   `Authorization: Bearer $CRON_SECRET`. Vercel Cron cannot send custom headers
   and would get a 401 on every run; use system cron, an external cron service,
   or move the secret into the URL path.

Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` as host environment variables. Because
`.env` is gitignored, a host with no such variables will seed no admin account
and lock everyone out of the app.

## The one thing to know first

**LeetCode has no official public API, and it caps what you can read at your 20
most recent accepted submissions.** This is a hard limit, verified against the
live endpoint:

- `recentAcSubmissionList` returns at most 20 rows, no matter what `limit` you
  pass. Asking for 100 gets you 20.
- `submissionList` takes no `username` argument — it is the site-wide feed, so
  it cannot be used to read a single person's history.
- `problemsetQuestionList` was renamed to `problemsetQuestionListV2`.
- A handle that no longer exists returns an **empty** list, not a 404, so
  `src/lib/sync.ts` checks `userPublicProfile` first and reports a renamed
  account as a sync failure instead of leaving a permanently empty row.

Full solve history therefore **cannot be backfilled**. The app accumulates
instead: every sync pulls that 20-row window and stores anything new it finds,
so local history becomes more complete the longer you leave it running. The
heatmap and streaks are accurate for the period the app has been watching and
sparse before that. This is a data-source limitation, not a display choice.

`src/lib/leetcode.ts` documents the exact query shapes, including two
inconsistencies worth knowing if you extend it: the list endpoint returns
`"EASY"` while the single-problem endpoint returns `"Easy"`, and
`userContestRanking` no longer accepts a `star` field.

## Automatic syncing

Sync is driven by **your** scheduler, not a process inside the app. That means
the app stays stateless enough to restart whenever, and the schedule is a
GitHub Actions cron, a Windows Task Scheduler job, a systemd timer, or whatever
you already run.

Point it at:

```
GET /api/cron/sync
Authorization: Bearer <CRON_SECRET>
```

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/sync
```

Call it as often as you like. The endpoint self-throttles: it compares the last
successful run against **Minimum minutes between runs** in Settings and returns
`{"ran": false, "skippedReason": ...}` without touching LeetCode if the
interval has not elapsed. Set the scheduler to fire every 5 minutes and choose
the real interval in the UI.

`?force=1` bypasses the throttle, which is what the **Sync all now** button
uses. Without the header, the endpoint answers `401`; if `CRON_SECRET` is unset
it answers `503` rather than syncing with no authentication at all.

SQLite needs a persistent, writable volume. On a serverless host with an
ephemeral filesystem, the database will disappear between invocations.

## How a sync works

1. Refresh the problem catalogue (~4070 problems) if it is over a week stale.
   The submission feed gives titles only, so difficulty and topic tags have to
   come from here.
2. Check the account still exists, then fetch the newest 20 accepted
   submissions.
3. Insert the ones not already stored. Re-solving a problem yields several
   submission rows, so ids are what get de-duplicated, not slugs.
4. Repair any problem still marked `UNKNOWN` via a direct per-slug lookup. This
   catches problems released since the last catalogue refresh.
5. Record the sync time, or the failure message, on the member row.

Sync is idempotent: running it twice in a row reports `imported: 0`.

Profiles are synced **sequentially with a configurable pause**, ordered
least-recently-synced first. The pause matters more than it looks — firing 50
profiles in parallel is the fastest way to get the whole IP rate limited, which
would cost you the history this app exists to collect. Ordering by staleness
rather than creation order is what stops members past the per-run cap from
starving.

## Features

| Feature | Where |
| --- | --- |
| Team standings | `/`, ranked by this week's count, then streak, then total |
| Weekly bar chart | Member page, Monday-based weeks |
| Current + longest streak | A day that has not been solved *yet* does not break the streak until it is fully missed |
| Difficulty breakdown | Donut chart, all tracked solves |
| Consistency heatmap | 26-week GitHub-style grid |
| Topic tags | Ranked list over all tracked solves |
| Question titles | Recent-problems table, linked to LeetCode |
| Member management | `/admin/members`, add/edit/team-assign/deactivate/delete |
| Team names | `/admin/teams`, rename, or add/remove teams with `+` |
| Admin accounts | `/admin/admins`, add other admins, change your own password |
| Sync settings | `/admin/settings`, interval, per-profile delay, run cap |
| Login | Email + password, bcrypt (cost 12), server-side sessions in SQLite |

## Notes on the data

- Dates are bucketed in **local time**. `dayKey` deliberately avoids
  `toISOString()`, which would shift late-evening solves into the next day.
- Weeks start **Monday**, matching LeetCode's own numbering.
- Topic counts sum to more than the number of problems, because a problem
  contributes to each of its tags.
- Standings rank **locally stored** submissions, so they reflect what each
  person has actually synced rather than penalising anyone for syncing less
  often.
- A profile that is `active: false` is skipped by every run but keeps its
  history. That is the right choice for a leaver; delete the member instead if
  the history should go too.
- Recently released LeetCode problems sometimes have no topic tags yet. They
  show as blank rather than being dropped.

## Project layout

```
prisma/schema.prisma        Team, Member, User, Session, Problem, Submission, Setting
prisma/seed.ts              5 starting teams + the admin from .env
prisma.config.ts            Anchors the SQLite path for the Prisma CLI
src/lib/leetcode.ts         GraphQL client, documents the API constraints
src/lib/sync.ts             Incremental import, rotation, metadata repair
src/lib/settings.ts         Install-wide settings, throttle, cron secret check
src/lib/stats.ts            Streak / weekly / difficulty / topic / heatmap maths
src/lib/stats.test.ts       20 unit tests for the above
src/lib/leaderboard.ts      Team standings aggregation
src/lib/auth.ts             bcrypt + DB-backed sessions, requireAdmin
src/app/admin/actions.ts    Every write, each behind requireAdmin
src/app/api/cron/sync/      Secret-protected scheduler endpoint
src/components/Charts.tsx   Weekly bar + difficulty donut (recharts)
src/components/Heatmap.tsx  Contribution grid
```

## Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm run db:setup     # migrate + generate + seed
npm run db:seed      # seed only (safe to re-run)
npm run typecheck    # route types + tsc --noEmit
npx eslint .         # lint
npx vitest run       # unit tests
```

Use `npm run typecheck` rather than a bare `npx tsc --noEmit`. `next-env.d.ts`
declares the `LayoutProps` / `PageProps` globals and is gitignored, so on a fresh
clone plain `tsc` reports those two as missing until a build has run once.
`next typegen` regenerates them without a full build.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Prisma 7 +
SQLite (`better-sqlite3` driver adapter) · Tailwind CSS 4 · Recharts · bcryptjs.

Prisma 7 requires the connection URL in `prisma.config.ts` rather than the
schema, and a driver adapter passed to `PrismaClient`.

Node 20.9+ required (developed on 24).
