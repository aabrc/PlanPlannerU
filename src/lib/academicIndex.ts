import type { Course, GradeAttempt, Period } from "../types";

export type AcademicIndexMode = "period" | "cumulative";

export interface AcademicIndexSummary {
  index: number | null;
  totalCredits: number;
  qualityPoints: number;
  courseCount: number;
  attempts: GradeAttempt[];
}

/** Converts a numeric grade to the PUCMM quality-point scale supplied for PlanPlannerU. */
export function qualityPointsForGrade(grade: number): number {
  if (grade >= 90) return 4;
  if (grade >= 80) return 3;
  if (grade >= 70) return 2;
  if (grade >= 60) return 1;
  return 0;
}

export function letterForGrade(grade: number): string {
  if (grade >= 90) return "A";
  if (grade >= 80) return "B";
  if (grade >= 70) return "C";
  if (grade >= 60) return "D";
  return "F";
}

/**
 * Period index includes the grades recorded in that period.
 * Cumulative index includes only the chronologically latest attempt for each course.
 * Zero-credit courses are shown in the planner but do not affect the weighted average.
 */
export function calculateAcademicIndex(
  gradeAttempts: GradeAttempt[],
  courses: Course[],
  periods: Period[],
  mode: AcademicIndexMode,
  periodId?: string
): AcademicIndexSummary {
  const courseByCode = new Map(courses.map((course) => [course.code, course]));
  let selectedAttempts: GradeAttempt[];

  if (mode === "period") {
    selectedAttempts = gradeAttempts.filter((attempt) => attempt.periodId === periodId);
  } else {
    const periodOrder = new Map(periods.map((period, index) => [period.id, index]));
    const latestByCourse = new Map<string, GradeAttempt>();

    for (const attempt of gradeAttempts) {
      const previous = latestByCourse.get(attempt.courseCode);
      const attemptOrder = periodOrder.get(attempt.periodId) ?? -1;
      const previousOrder = previous ? periodOrder.get(previous.periodId) ?? -1 : -1;

      if (
        !previous ||
        attemptOrder > previousOrder ||
        (attemptOrder === previousOrder && attempt.createdAt >= previous.createdAt)
      ) {
        latestByCourse.set(attempt.courseCode, attempt);
      }
    }

    selectedAttempts = Array.from(latestByCourse.values());
  }

  const countedAttempts = selectedAttempts.filter((attempt) => {
    const course = courseByCode.get(attempt.courseCode);
    return !!course && course.credits > 0;
  });

  const totalCredits = countedAttempts.reduce((sum, attempt) => {
    return sum + (courseByCode.get(attempt.courseCode)?.credits || 0);
  }, 0);

  const qualityPoints = countedAttempts.reduce((sum, attempt) => {
    const credits = courseByCode.get(attempt.courseCode)?.credits || 0;
    return sum + qualityPointsForGrade(attempt.grade) * credits;
  }, 0);

  return {
    index: totalCredits > 0 ? qualityPoints / totalCredits : null,
    totalCredits,
    qualityPoints,
    courseCount: countedAttempts.length,
    attempts: countedAttempts
  };
}
