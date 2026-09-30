const ENDPOINT = "https://leetcode.com/graphql/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

/**
 * LeetCode exposes no official public API. Everything here targets the same
 * GraphQL endpoint the website itself uses, verified by hand:
 *
 *  - recentAcSubmissionList  works, but LeetCode caps the result at 20 rows
 *                            no matter what `limit` you pass. This is the
 *                            single biggest constraint in the app: a user's
 *                            full solve history cannot be backfilled.
 *  - submissionList          is a global site-wide feed and takes no username,
 *                            so it cannot be used for per-user history.
 *  - problemsetQuestionList  was renamed; use problemsetQuestionListV2.
 *
 * Because of the 20-row cap, sync accumulates history locally: every sync pulls
 * the newest 20 accepted submissions and upserts anything not already stored.
 */
export const RECENT_AC_LIMIT = 20;

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

export class LeetCodeError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "not_found" | "graphql",
  ) {
    super(message);
    this.name = "LeetCodeError";
  }
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Referer: "https://leetcode.com/",
        Origin: "https://leetcode.com",
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new LeetCodeError(
      "Could not reach LeetCode. Check your connection and try again.",
      "network",
    );
  }

  const payload = (await res.json().catch(() => null)) as GraphQLResponse<T> | null;

  if (!payload) {
    throw new LeetCodeError("LeetCode returned an unreadable response.", "network");
  }

  // A missing user is reported as both an error and a null field. Prefer the
  // null check so we can say something useful to the person signing up.
  if (payload.errors?.length && !payload.data) {
    const raw = payload.errors.map((e) => e.message).join("; ");
    if (/does not exist|not found/i.test(raw)) {
      throw new LeetCodeError(
        "No LeetCode user with that username.",
        "not_found",
      );
    }
    throw new LeetCodeError(raw, "graphql");
  }

  if (!res.ok) {
    throw new LeetCodeError(`LeetCode responded with ${res.status}.`, "graphql");
  }

  if (payload.errors?.length && !payload.data) {
    throw new LeetCodeError(payload.errors[0].message, "graphql");
  }

  return payload.data as T;
}

export type RecentSubmission = {
  id: string;
  title: string;
  titleSlug: string;
  timestamp: number;
};

export type ProfileTotals = {
  all: number;
  easy: number;
  medium: number;
  hard: number;
};

export type ContestStanding = {
  attendedContestsCount: number;
  rating: number;
  globalRanking: number;
  topPercentage: number;
};

export type ProblemMeta = {
  titleSlug: string;
  title: string;
  questionFrontendId: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  acRate: number | null;
  topics: string[];
};

/** The newest accepted submissions, capped by LeetCode at 20 rows. */
export async function fetchRecentAccepted(
  username: string,
): Promise<RecentSubmission[]> {
  const data = await gql<{ recentAcSubmissionList: RecentSubmission[] }>(
    `query recentAcList($username: String!, $limit: Int) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        id
        title
        titleSlug
        timestamp
      }
    }`,
    { username, limit: RECENT_AC_LIMIT },
  );
  return data.recentAcSubmissionList ?? [];
}

/**
 * Lifetime solve totals straight from the LeetCode profile.
 *
 * Returns null only when no such user exists. A real user with nothing
 * submitted yet reports null submitStats, which is a legitimate zero rather
 * than a missing account, so the two cases must not collapse into one value.
 */
export async function fetchProfileTotals(
  username: string,
): Promise<ProfileTotals | null> {
  const data = await gql<{
    matchedUser: {
      submitStats: {
        acSubmissionNum: { difficulty: string; count: number }[];
      } | null;
    } | null;
  }>(
    `query userPublicProfile($username: String!) {
      matchedUser(username: $username) {
        username
        submitStats {
          acSubmissionNum { difficulty count }
        }
      }
    }`,
    { username },
  );

  if (!data.matchedUser) return null;

  const stats = data.matchedUser.submitStats?.acSubmissionNum;
  const pick = (label: string) =>
    stats?.find((s) => s.difficulty === label)?.count ?? 0;

  return {
    all: pick("All"),
    easy: pick("Easy"),
    medium: pick("Medium"),
    hard: pick("Hard"),
  };
}

export async function fetchContestStanding(
  username: string,
): Promise<ContestStanding | null> {
  const data = await gql<{
    userContestRanking: {
      attendedContestsCount: number;
      rating: number;
      globalRanking: number;
      topPercentage: number;
    } | null;
  }>(
    `query userContestRankingInfo($username: String!) {
      userContestRanking(username: $username) {
        attendedContestsCount
        rating
        globalRanking
        topPercentage
      }
    }`,
    { username },
  );
  return data.userContestRanking ?? null;
}

const PROBLEMSET_QUERY = `query problemsetList($categorySlug: String, $limit: Int, $skip: Int) {
  problemsetQuestionListV2(categorySlug: $categorySlug, limit: $limit, skip: $skip) {
    questions {
      questionFrontendId
      titleSlug
      title
      acRate
      difficulty
      topicTags { name }
    }
  }
}`;

const PROBLEMSET_PAGE = 100;
// The list is ordered oldest-first, so anything past this bound is the newest
// problems -- exactly the ones users have just solved. The walk stops early on
// a short page, so this is only a runaway guard, not the normal exit.
const PROBLEMSET_MAX = 6000;

/**
 * Walks the whole public problem set to build a titleSlug -> metadata map.
 *
 * The recent-submissions feed only returns titles, never difficulty or topic
 * tags, so this lookup is the only way to fill those in. The full set is
 * ~3400 rows, so callers cache the result in the Problem table rather than
 * re-fetching per sync.
 */
export async function fetchAllProblemMeta(
  onProgress?: (fetched: number) => void,
): Promise<ProblemMeta[]> {
  const out: ProblemMeta[] = [];

  for (let skip = 0; skip < PROBLEMSET_MAX; skip += PROBLEMSET_PAGE) {
    const data: {
      problemsetQuestionListV2: {
        questions: {
          questionFrontendId: string;
          titleSlug: string;
          title: string;
          acRate: number | null;
          difficulty: ProblemMeta["difficulty"];
          topicTags: { name: string }[];
        }[];
      };
    } = await gql(PROBLEMSET_QUERY, {
      categorySlug: "",
      limit: PROBLEMSET_PAGE,
      skip,
    });

    const page = data.problemsetQuestionListV2?.questions ?? [];
    if (page.length === 0) break;

    for (const q of page) {
      out.push({
        titleSlug: q.titleSlug,
        title: q.title,
        questionFrontendId: q.questionFrontendId,
        difficulty: q.difficulty,
        acRate: q.acRate,
        topics: q.topicTags.map((t) => t.name),
      });
    }

    onProgress?.(out.length);
    if (page.length < PROBLEMSET_PAGE) break;
  }

  return out;
}

/**
 * Fetches a single problem by slug.
 *
 * Serves as the backfill for anything the paginated catalogue walk missed --
 * a newly released problem can sit outside the catalogue until the next full
 * refresh, and a placeholder row has no difficulty or topic tags to show.
 */
export async function fetchProblemBySlug(
  titleSlug: string,
): Promise<ProblemMeta | null> {
  const data = await gql<{
    question: {
      questionFrontendId: string;
      titleSlug: string;
      title: string;
      acRate: number | null;
      difficulty: string;
      topicTags: { name: string }[];
    } | null;
  }>(
    `query questionDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionFrontendId
        titleSlug
        title
        acRate
        difficulty
        topicTags { name }
      }
    }`,
    { titleSlug },
  );

  const q = data.question;
  if (!q) return null;

  // This endpoint returns "Easy"/"Medium"/"Hard", while the list endpoint
  // returns "EASY"/"MEDIUM"/"HARD". Normalise so breakdowns stay comparable.
  const raw = q.difficulty.toUpperCase();
  const difficulty: ProblemMeta["difficulty"] =
    raw === "EASY" || raw === "MEDIUM" || raw === "HARD" ? raw : "EASY";

  return {
    titleSlug: q.titleSlug,
    title: q.title,
    questionFrontendId: q.questionFrontendId,
    difficulty,
    acRate: q.acRate,
    topics: q.topicTags.map((t) => t.name),
  };
}
