"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fetchProfileTotals } from "@/lib/leetcode";
import { setSetting, type SettingKey } from "@/lib/settings";
import { syncAllMembers, MANUAL_SUBMISSION_PREFIX } from "@/lib/sync";

export type FormState = { ok: boolean; message: string };

const USERNAME_RE = /^[a-zA-Z0-9_-]{2,30}$/;

function fail(message: string): FormState {
  return { ok: false, message };
}

export async function renameTeamAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (name.length < 1 || name.length > 40) {
    return fail("Team name must be 1-40 characters.");
  }

  await prisma.team.update({ where: { id: teamId }, data: { name } });
  revalidatePath("/");
  revalidatePath("/admin/teams");
  return { ok: true, message: "Team renamed." };
}

/**
 * A backstop on team count. Nothing in the app needs this many, and it keeps a
 * double-clicked "+" from burying the real teams under a wall of empties.
 */
const MAX_TEAMS = 50;

export async function createTeamAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const existing = await prisma.team.count();
  if (existing >= MAX_TEAMS) {
    return fail(`There is a limit of ${MAX_TEAMS} teams.`);
  }

  // The name is optional so a single press of "+" does something sensible.
  const typed = String(formData.get("name") ?? "").trim();
  const name = typed || `Team ${existing + 1}`;

  if (name.length > 40) {
    return fail("Team name must be 40 characters or fewer.");
  }

  const clash = await prisma.team.findFirst({ where: { name } });
  if (clash) return fail(`"${name}" already exists.`);

  // Continue the existing order rather than starting over, so a new team lands
  // at the bottom of the standings instead of jumping to the top.
  const last = await prisma.team.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.team.create({
    data: { name, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  revalidatePath("/");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/members");
  return { ok: true, message: `Added "${name}".` };
}

export async function deleteTeamAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "");
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { _count: { select: { members: true } } },
  });
  if (!team) return fail("That team no longer exists.");

  // Deleting a team cascades to its members and their submissions, which is a
  // lot of history to destroy from a stray click. Refuse unless there is
  // nothing to lose, and say why.
  if (team._count.members > 0) {
    return fail(
      `${team.name} still has ${team._count.members} member(s). Move or remove them first, otherwise their tracked history would be deleted too.`,
    );
  }

  await prisma.team.delete({ where: { id: teamId } });

  revalidatePath("/");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/members");
  return { ok: true, message: `Deleted "${team.name}".` };
}

export async function addMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const displayName = String(formData.get("displayName") ?? "").trim();
  const username = String(formData.get("leetcodeUsername") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "");

  if (displayName.length < 1 || displayName.length > 60) {
    return fail("Display name must be 1-60 characters.");
  }
  if (!USERNAME_RE.test(username)) {
    return fail("LeetCode usernames are 2-30 letters, numbers, - or _.");
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return fail("Choose a team.");

  const existing = await prisma.member.findUnique({ where: { leetcodeUsername: username } });
  if (existing) return fail(`@${username} is already tracked.`);

  // Verify against LeetCode now so a typo is caught here rather than turning
  // into a permanently failing profile on the board.
  let lifetime = 0;
  try {
    const totals = await fetchProfileTotals(username);
    if (!totals) return fail(`No LeetCode user called "${username}".`);
    lifetime = totals.all;
  } catch (err) {
    return fail(
      err instanceof Error
        ? `Could not reach LeetCode: ${err.message}`
        : "Could not reach LeetCode.",
    );
  }

  const member = await prisma.member.create({
    data: { displayName, leetcodeUsername: username, teamId },
  });

  // Pull their initial history straight away so the board is not empty.
  let note = `Added @${username} (${lifetime} lifetime solves).`;
  try {
    const result = await syncAllMembers({ force: true, memberId: member.id });
    const outcome = result.members[0];
    if (outcome && !outcome.error) {
      note += ` Imported ${outcome.imported} recent solves.`;
    } else {
      note += " Initial sync failed; a scheduled run will retry.";
    }
  } catch {
    note += " Initial sync failed; a scheduled run will retry.";
  }

  revalidatePath("/");
  revalidatePath("/admin/members");
  return { ok: true, message: note };
}

export async function updateMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const memberId = String(formData.get("memberId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "");
  const active = formData.get("active") === "on";

  if (displayName.length < 1 || displayName.length > 60) {
    return fail("Display name must be 1-60 characters.");
  }
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return fail("Choose a team.");

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return fail("That member no longer exists.");

  await prisma.member.update({
    where: { id: memberId },
    data: { displayName, teamId, active },
  });

  revalidatePath("/");
  revalidatePath("/admin/members");
  revalidatePath(`/member/${memberId}`);
  return { ok: true, message: `Updated ${displayName}.` };
}

export async function deleteMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const memberId = String(formData.get("memberId") ?? "");
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return fail("That member no longer exists.");

  // Submissions cascade with the member. This is destructive, so the UI
  // requires an explicit confirmation before this action is reachable.
  await prisma.member.delete({ where: { id: memberId } });

  revalidatePath("/");
  revalidatePath("/admin/members");
  return { ok: true, message: `Removed ${member.displayName} and their history.` };
}

export async function updateSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const keys: SettingKey[] = ["syncIntervalMinutes", "leetcodeDelayMs", "maxMembersPerRun"];
  for (const key of keys) {
    const raw = formData.get(key);
    if (raw === null) continue;
    await setSetting(key, String(raw));
  }

  revalidatePath("/admin/settings");
  revalidatePath("/");
  return { ok: true, message: "Settings saved." };
}

export async function syncNowAction(): Promise<FormState> {
  await requireAdmin();

  const result = await syncAllMembers({ force: true });
  revalidatePath("/");

  if (!result.ran) return fail(result.skippedReason ?? "Sync did not run.");
  return {
    ok: result.failed === 0,
    message:
      result.attempted === 0
        ? "No active profiles to sync yet."
        : `Synced ${result.succeeded}/${result.attempted} profiles, ` +
          `${result.totalImported} new solves` +
          (result.failed > 0 ? `, ${result.failed} failed.` : "."),
  };
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { verifyPassword } = await import("@/lib/auth");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return fail("Email and password are required.");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  const invalid: FormState = { ok: false, message: "Email or password is incorrect." };
  if (!user) {
    // Spend comparable time on a missing account so the form cannot be used to
    // discover which emails exist.
    await verifyPassword(
      password,
      "$2a$12$0000000000000000000000000000000000000000000000000000",
    );
    return invalid;
  }

  if (!(await verifyPassword(password, user.passwordHash))) return invalid;

  const { createSession } = await import("@/lib/auth");
  await createSession(user.id);
  redirect("/");
}

/**
 * Deliberately permissive. The real gate is the confirmation message below plus
 * a minimum length; an over-strict pattern here mostly rejects valid passphrases
 * and pushes people back to reusing one weak password.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function createAdminAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return fail("Enter a valid email address.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > 200) {
    return fail("Password must be 200 characters or fewer.");
  }
  // bcrypt silently ignores bytes past 72, so "pass...X" and "pass...Y" would
  // otherwise be the same hash.
  if (Buffer.byteLength(password, "utf8") > 72) {
    return fail("Password is too long (72 bytes max).");
  }
  if (password !== confirm) {
    return fail("The two passwords do not match.");
  }

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return fail(`${email} already has an account.`);
  }

  const { hashPassword } = await import("@/lib/auth");
  await prisma.user.create({
    data: {
      email,
      name: name || email.split("@")[0],
      role: "ADMIN",
      passwordHash: await hashPassword(password),
    },
  });

  revalidatePath("/admin/admins");
  return { ok: true, message: `Created an admin account for ${email}.` };
}

export async function deleteAdminAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  if (userId === me.id) {
    return fail("You cannot remove the account you are signed in with.");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!target) return fail("That account no longer exists.");

  const adminsLeft = await prisma.user.count();
  if (adminsLeft <= 1) {
    return fail("This is the last admin account. Create another one first.");
  }

  // Cascades to this user's sessions, so their access ends immediately.
  await prisma.user.delete({ where: { id: userId } });

  revalidatePath("/admin/admins");
  return { ok: true, message: `Removed ${target.email}.` };
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await requireAdmin();

  const current = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > 200 || Buffer.byteLength(password, "utf8") > 72) {
    return fail("Password is too long (72 bytes max).");
  }
  if (password !== confirm) return fail("The two passwords do not match.");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: me.id },
    select: { passwordHash: true },
  });

  const { verifyPassword, hashPassword } = await import("@/lib/auth");
  if (!(await verifyPassword(current, user.passwordHash))) {
    return fail("Your current password is incorrect.");
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(password) },
  });

  return { ok: true, message: "Password updated." };
}

/**
 * Records a solve that LeetCode never reported, for example one that fell past
 * the 20-row window between syncs, or a paper exercise done outside LeetCode.
 *
 * LeetCode only exposes each member's newest 20 accepted submissions, so a
 * missed solve is otherwise invisible forever. This is the manual override.
 */
export async function addManualSolveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const memberId = String(formData.get("memberId") ?? "");
  const query = String(formData.get("problem") ?? "").trim();
  const solvedOn = String(formData.get("solvedOn") ?? "").trim();

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, displayName: true },
  });
  if (!member) return fail("That member no longer exists.");

  if (!query) return fail("Enter a LeetCode question number or problem slug.");
  if (!solvedOn) return fail("Choose the date it was solved.");

  // YYYY-MM-DD from <input type="date">. Parsed as local noon so a daylight
  // saving shift can never move the solve onto the neighbouring day, since
  // stats bucket by local calendar date.
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(solvedOn);
  if (!parsed) return fail("That date could not be read.");
  const solvedAt = new Date(
    Number(parsed[1]),
    Number(parsed[2]) - 1,
    Number(parsed[3]),
    12,
  );
  if (Number.isNaN(solvedAt.getTime())) return fail("That date is not valid.");
  if (solvedAt.getTime() > Date.now()) {
    return fail("That date is in the future.");
  }

  // Accept a question number ("146"), a slug ("lru-cache") or a title with its
  // number ("146. LRU Cache"), which is what people paste from the site.
  const cleaned = query.replace(/^\d+[.)]\s*/, "").trim();
  const asNumber = /^\d+$/.test(query.trim())
    ? query.trim().replace(/^0+/, "")
    : /^\d+[.)]/.test(query.trim())
      ? query.trim().match(/^\d+/)?.[0].replace(/^0+/, "")
      : null;

  const problem = await prisma.problem.findFirst({
    where: {
      titleSlug: { not: "__catalogue_refreshed_at__" },
      OR: [
        ...(asNumber ? [{ questionNumber: asNumber }] : []),
        { titleSlug: cleaned.toLowerCase().replace(/\s+/g, "-") },
        { title: { equals: cleaned } },
      ],
    },
    select: { titleSlug: true, title: true, questionNumber: true },
  });

  if (!problem) {
    return fail(
      `"${query}" is not in the problem catalogue. Sync to refresh it, or use the exact question number.`,
    );
  }

  // Catch a double submission before it lands, since the same problem solved
  // twice on one day is a typo rather than two distinct solves.
  const startOfDay = new Date(solvedAt);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(solvedAt);
  endOfDay.setHours(23, 59, 59, 999);

  const sameDay = await prisma.submission.findFirst({
    where: {
      memberId: member.id,
      titleSlug: problem.titleSlug,
      solvedAt: { gte: startOfDay, lte: endOfDay },
    },
    select: { id: true },
  });
  if (sameDay) {
    return fail(`${problem.title} is already recorded for that day.`);
  }

  await prisma.submission.create({
    data: {
      // No LeetCode submission id exists, so mint a clearly-marked one that
      // can never collide with the numeric ids the API returns.
      id: `${MANUAL_SUBMISSION_PREFIX}${crypto.randomUUID()}`,
      memberId: member.id,
      titleSlug: problem.titleSlug,
      solvedAt,
    },
  });

  revalidatePath("/");
  revalidatePath(`/member/${member.id}`);
  revalidatePath("/admin/members");
  return {
    ok: true,
    message: `Added "${problem.title}" for ${member.displayName}.`,
  };
}

export async function deleteManualSolveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const id = String(formData.get("submissionId") ?? "");

  // Read the owner first: the row is gone by the time we would look again, and
  // the member path needs revalidating too.
  const existing = await prisma.submission.findUnique({
    where: { id },
    select: { memberId: true },
  });
  if (!existing) return fail("That entry no longer exists.");

  // Scoped to the prefix so a real synced row can never be removed from here.
  const deleted = await prisma.submission.deleteMany({
    where: { id: { startsWith: MANUAL_SUBMISSION_PREFIX, equals: id } },
  });
  if (deleted.count === 0) {
    return fail("That entry is a synced solve and cannot be deleted here.");
  }

  revalidatePath("/");
  revalidatePath(`/member/${existing.memberId}`);
  revalidatePath("/admin/members");
  return { ok: true, message: "Removed the manual entry." };
}
