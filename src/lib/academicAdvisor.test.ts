import { describe, expect, it } from "vitest";
import { buildAcademicAdvice } from "./academicAdvisor";
import { calculateGraduationProjection } from "./graduationProjection";
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

function planWith(periods: Period[], groups: CurriculumPlan["groups"] = [], totalCredits = 60): CurriculumPlan {
  return {
    id: "TEST-CURRICULUM",
    periods,
    groups,
    totalCredits,
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


describe("buildAcademicAdvice: electivas, laboratorios y estados", () => {
  it("ordena una electiva seleccionada según el año y período de su grupo", () => {
    const elective = course("ELEC_EARLY");
    const later = course("CORE_LATER");
    const curriculum = planWith([
      { ...period("y1p2", 1, 2, []), groups: ["ELECTIVE-GROUP"] },
      period("y1p3", 1, 3, [later]),
      period("y2p1", 2, 1, [])
    ], [{
      id: "ELECTIVE-GROUP",
      name: "Electiva de prueba",
      minCourses: 1,
      minCredits: 3,
      options: [elective]
    }]);

    const state = stateAt("y2p1");
    state.selections["ELECTIVE-GROUP"] = elective.code;
    const advice = buildAcademicAdvice(curriculum, state);

    expect(advice.recommendations.slice(0, 2).map((item) => item.course.code))
      .toEqual(["ELEC_EARLY", "CORE_LATER"]);
  });

  it("mantiene un laboratorio bloqueado en rezagadas y muestra sus prerrequisitos pendientes", () => {
    const curriculum = planWith([
      period("y1p1", 1, 1, [course("ICC101")]),
      period("y1p2", 1, 2, [course("ICC103", ["ICC101"])]),
      period("y1p3", 1, 3, [course("LAB_NETWORKS", ["ICC103"])]),
      period("y2p1", 2, 1, [])
    ]);

    const advice = buildAcademicAdvice(curriculum, stateAt("y2p1"));
    const lab = advice.laggedCourses.find((item) => item.course.code === "LAB_NETWORKS");

    expect(lab).toBeDefined();
    expect(lab?.canEnroll).toBe(false);
    expect(lab?.blockers).toContain("ICC103");
    expect(advice.recommendations.some((item) => item.course.code === "LAB_NETWORKS"))
      .toBe(false);
  });

  it("no recomienda asignaturas aprobadas ni las cuenta como rezagadas", () => {
    const curriculum = planWith([
      period("y1p1", 1, 1, [course("APPROVED_COURSE")]),
      period("y1p2", 1, 2, [course("NEXT_COURSE", ["APPROVED_COURSE"])]),
      period("y2p1", 2, 1, [])
    ]);

    const advice = buildAcademicAdvice(
      curriculum,
      stateAt("y2p1", ["APPROVED_COURSE"])
    );

    expect(advice.recommendations.map((item) => item.course.code))
      .toContain("NEXT_COURSE");
    expect(advice.recommendations.some((item) => item.course.code === "APPROVED_COURSE"))
      .toBe(false);
    expect(advice.laggedCourses.some((item) => item.course.code === "APPROVED_COURSE"))
      .toBe(false);
  });

  it("respeta los requisitos externos que aún no se han completado", () => {
    const required = course("COURSE_WITH_EXTERNAL_REQ", ["ILE311"]);
    const curriculum = planWith([
      period("y1p1", 1, 1, [required]),
      period("y2p1", 2, 1, [])
    ]);

    const advice = buildAcademicAdvice(curriculum, stateAt("y2p1"));
    const blocked = advice.laggedCourses.find(
      (item) => item.course.code === "COURSE_WITH_EXTERNAL_REQ"
    );

    expect(blocked?.canEnroll).toBe(false);
    expect(blocked?.blockers).toContain("ILE311");
  });
});


describe("buildAcademicAdvice: cronología del pensum", () => {
  it("detecta materias rezagadas por año y período aunque el arreglo esté desordenado", () => {
    const curriculum = planWith([
      period("y1p2", 1, 2, [course("CURRENT_PERIOD_COURSE")]),
      period("y1p1", 1, 1, [course("OLDER_BLOCKED", ["UNKNOWN_EXTERNAL_REQ"])]),
      period("y1p3", 1, 3, [course("FUTURE_PERIOD_COURSE")])
    ]);

    const advice = buildAcademicAdvice(
      curriculum,
      stateAt("y1p2")
    );

    const older = advice.laggedCourses.find(
      (item) => item.course.code === "OLDER_BLOCKED"
    );

    expect(older).toBeDefined();
    expect(older?.canEnroll).toBe(false);
    expect(older?.blockers).toContain("UNKNOWN_EXTERNAL_REQ");
  });
});


describe("calculateGraduationProjection", () => {
  it("cuenta créditos aprobados de asignaturas y electivas seleccionadas", () => {
    const elective = course("ELECTIVE_APPROVED");
    const curriculum = planWith([
      period("y1p1", 1, 1, [course("APPROVED_CORE")]),
      { ...period("y1p2", 1, 2, [course("CURRENT_CORE")]), groups: ["ELECTIVE-GROUP"] },
      period("y1p3", 1, 3, [course("FUTURE_CORE")]),
      period("y2p1", 2, 1, [course("LATER_CORE")])
    ], [{
      id: "ELECTIVE-GROUP",
      name: "Electiva",
      minCourses: 1,
      minCredits: 3,
      options: [elective]
    }], 15);

    const state = stateAt("y1p2", ["APPROVED_CORE", "ELECTIVE_APPROVED"]);
    state.selections["ELECTIVE-GROUP"] = "ELECTIVE_APPROVED";
    state.meta.loadPerTerm = "3";

    const result = calculateGraduationProjection(curriculum, state);

    expect(result.status).toBe("projected");
    expect(result.approvedCredits).toBe(6);
    expect(result.remainingCredits).toBe(9);
    expect(result.periodsRemaining).toBe(3);
    expect(result.finishYear).toBe(2);
    expect(result.finishTerm).toBe(1);
  });

  it("solicita el período actual antes de estimar la finalización", () => {
    const curriculum = planWith([
      period("y1p1", 1, 1, [course("COURSE_A")]),
      period("y1p2", 1, 2, [course("COURSE_B")])
    ], [], 6);

    const result = calculateGraduationProjection(curriculum, stateAt(""));

    expect(result.status).toBe("needs-period");
    expect(result.remainingCredits).toBe(6);
    expect(result.finishYear).toBeNull();
  });

  it("reconoce el plan completado sin exigir un período actual", () => {
    const curriculum = planWith([
      period("y1p1", 1, 1, [course("COURSE_A"), course("COURSE_B")])
    ], [], 6);

    const result = calculateGraduationProjection(
      curriculum,
      stateAt("", ["COURSE_A", "COURSE_B"])
    );

    expect(result.status).toBe("complete");
    expect(result.remainingCredits).toBe(0);
    expect(result.periodsRemaining).toBe(0);
  });

  it("extiende la estimación si el ritmo supera los períodos incluidos en el pensum", () => {
    const curriculum = planWith([
      period("y1p1", 1, 1, [course("COURSE_A")]),
      period("y1p2", 1, 2, [course("COURSE_B")])
    ], [], 10);
    const state = stateAt("y1p2");
    state.meta.loadPerTerm = "1";

    const result = calculateGraduationProjection(curriculum, state);

    expect(result.status).toBe("projected");
    expect(result.exceedsPlan).toBe(true);
    expect(result.finishYear).not.toBeNull();
    expect(result.finishTerm).not.toBeNull();
  });
});
