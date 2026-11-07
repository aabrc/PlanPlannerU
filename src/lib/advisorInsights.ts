import type { AdvisorCommunityInsight } from "../types";

/**
 * A course insight becomes eligible only after a minimum cohort size.
 * This is a basic privacy and reliability guard, not a guarantee of anonymity
 * by itself; future aggregation must also avoid retaining raw user submissions.
 */
export const MIN_COMMUNITY_INSIGHT_RESPONSES = 10;

export function advisorInsightKey(curriculumId: string, courseCode: string): string {
  return curriculumId + "::" + courseCode.toUpperCase();
}

/**
 * Accepts only already-aggregated rows from the future community-insights source.
 * It deliberately rejects raw submissions and rows containing insufficient counts.
 */
export function normalizeAdvisorCommunityInsights(
  value: unknown,
  curriculumId: string
): Record<string, AdvisorCommunityInsight> {
  if (!Array.isArray(value) || !curriculumId.trim()) return {};

  const normalized: Record<string, AdvisorCommunityInsight> = {};

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const row = item as Record<string, unknown>;
    const rowCurriculumId = typeof row.curriculumId === "string"
      ? row.curriculumId
      : "";
    const courseCode = typeof row.courseCode === "string"
      ? row.courseCode.trim().toUpperCase()
      : "";
    const responseCount = Number(row.responseCount);
    const meanDifficulty = Number(row.meanDifficulty);
    const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : undefined;

    if (rowCurriculumId !== curriculumId ||
        !/^[A-Z0-9-]{2,24}$/.test(courseCode) ||
        !Number.isInteger(responseCount) ||
        responseCount < MIN_COMMUNITY_INSIGHT_RESPONSES ||
        !Number.isFinite(meanDifficulty) ||
        meanDifficulty < 1 ||
        meanDifficulty > 5) {
      continue;
    }

    normalized[advisorInsightKey(curriculumId, courseCode)] = {
      curriculumId,
      courseCode,
      responseCount,
      meanDifficulty,
      ...(updatedAt ? { updatedAt } : {})
    };
  }

  return normalized;
}
