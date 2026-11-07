import { describe, expect, it } from "vitest";
import { buildAcademicAdvice } from "./academicAdvisor";
import type { Course, CurriculumPlan, Period, PlannerState } from "../types";

function course(code: string, req: string[] = []): Course {
  return { code, name: code, credits: 3, req };
}

function period(
  id: string,
  year: number,
  term: number,
  courses: Course[]
): Period {
  return {
    id,
    year,
    term,
    label: `Año ${year} · Período ${term}`,
    courses,
    groups: [],
    baseCredits: courses.reduce((total, item) => total + item.credits, 0)
  };
}

function planWith(periods: Period[]): CurriculumPlan {
  return {
    id: "TEST-CURRICULUM",
    periods,
    groups: [],
    totalCredits: 60,
    externalRequirements: [],
    fixedCredits: 60,
    electiveMinimumCredits: 0
  };
}

function stateAt(currentPeriod: string, approved: string[] = []): PlannerState {
  return {
    courseStates: Object.fromEntries(approved.map((code) => [code, "approved"])),
    selections: {},
    externalDone: {},
    scheduleEvents: [],
    scheduleView: { start: 360, end: 1200, lastVisibleDay: 6 },
    gradeAttempts: [],
    meta: {
      currentPeriod,
      loadPerTerm: "15",
      gpa: "",
      internship: 0
    }
  };
}

describe("buildAcademicAdvice: orden académico", () => {
  it("prioriza ICC103 de Año 1 · Período 2 sobre cursos posteriores con más desbloqueos", () => {
    const curriculum = planWith([
      period("y1p1", 1, 1, [course("ICC101")]),
      // Deliberately place period 3 before period 2 in the array.
      // The result must follow year/term values, not array order or score.
      period("y1p3", 1, 3, [course("CORE_ADVANCED")]),
      period("y1p2", 1, 2, [course("ICC103", ["ICC101"])]),
      period("y2p1", 2, 1, [
        course("ADVANCED_DEP_1", ["CORE_ADVANCED"]),
        course("ADVANCED_DEP_2", ["CORE_ADVANCED"]),
        course("ADVANCED_DEP_3", ["CORE_ADVANCED"]),
        course("ICC104", ["ICC103"])
      ]),
      period("y3p1", 3, 1, [])
    ]);

    const advice = buildAcademicAdvice(
      curriculum,
      stateAt("y3p1", ["ICC101"])
    );

    expect(advice.recommendations[0]?.course.code).toBe("ICC103");
    expect(advice.recommendations[1]?.course.code).toBe("CORE_ADVANCED");
  });

  it("conserva los desbloqueos como criterio secundario dentro del mismo período", () => {
    const curriculum = planWith([
      period("y1p1", 1, 1, [
        course("COURSE_WITH_UNLOCK", []),
        course("COURSE_WITHOUT_UNLOCK", [])
      ]),
      period("y1p2", 1, 2, [
        course("UNLOCKED_NEXT", ["COURSE_WITH_UNLOCK"])
      ]),
      period("y2p1", 2, 1, [])
    ]);

    const advice = buildAcademicAdvice(
      curriculum,
      stateAt("y2p1")
    );

    expect(advice.recommendations.slice(0, 2).map((item) => item.course.code))
      .toEqual(["COURSE_WITH_UNLOCK", "COURSE_WITHOUT_UNLOCK"]);
  });
});
