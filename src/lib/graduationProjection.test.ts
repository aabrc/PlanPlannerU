import { describe, expect, it } from "vitest";
import { calculateGraduationProjection, normalizeCreditsPerTerm } from "./graduationProjection";
import type { Course, CurriculumPlan, Period, PlannerState } from "../types";

const course: Course = { code: "COURSE", name: "Course", credits: 3, req: [] };
const periods: Period[] = Array.from({ length: 12 }, (_, index) => ({
  id: "p" + (index + 1),
  year: Math.floor(index / 3) + 1,
  term: index % 3 + 1,
  label: `Año ${Math.floor(index / 3) + 1} · Período ${index % 3 + 1}`,
  courses: [course],
  groups: [],
  baseCredits: 3
}));
const plan: CurriculumPlan = {
  id: "LOAD-TEST",
  periods,
  groups: [],
  totalCredits: 100,
  externalRequirements: [],
  fixedCredits: 100,
  electiveMinimumCredits: 0
};

function stateWithLoad(load: string): PlannerState {
  return {
    courseStates: {},
    selections: {},
    externalDone: {},
    scheduleEvents: [],
    scheduleView: { start: 360, end: 1200, lastVisibleDay: 6 },
    gradeAttempts: [],
    meta: {
      currentPeriod: "p1",
      loadPerTerm: load,
      gpa: "",
      internship: 0
    }
  };
}

describe("normalizeCreditsPerTerm", () => {
  it.each([
    ["1", 1],
    ["22", 22],
    ["23", 23],
    ["30", 30],
    ["36", 30],
    ["22.9", 22],
    ["0", 15],
    ["", 15]
  ])("normaliza %s a %i créditos", (input, expected) => {
    expect(normalizeCreditsPerTerm(input)).toBe(expected);
  });
});

describe("calculateGraduationProjection: carga ampliada", () => {
  it("respeta la carga regular máxima de 22 créditos", () => {
    const result = calculateGraduationProjection(plan, stateWithLoad("22"));

    expect(result.creditsPerTerm).toBe(22);
    expect(result.periodsRemaining).toBe(5);
  });

  it("permite proyectar hasta 30 créditos cuando se selecciona carga ampliada", () => {
    const result = calculateGraduationProjection(plan, stateWithLoad("30"));

    expect(result.creditsPerTerm).toBe(30);
    expect(result.periodsRemaining).toBe(4);
  });
});
