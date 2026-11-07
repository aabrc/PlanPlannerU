import { describe, expect, it } from "vitest";
import { normalizePlannerState } from "./storage";
import type { PlannerState } from "../types";

describe("normalizePlannerState: compatibilidad y conservación", () => {
  it("conserva el progreso y migra ajustes antiguos del asesor sin sobrescribir perfiles nuevos", () => {
    const saved = {
      courseStates: { ICC103: "approved", ITT112: "inprogress" },
      selections: { "ITT-E01-T": "ITT403" },
      externalDone: { MAT311: false, ILE203: false, ILE311: true },
      scheduleEvents: [{
        id: "event-1",
        courseCode: "ITT112",
        title: "Introducción a las Redes",
        kind: "class",
        days: ["mon", "wed"],
        start: "08:00",
        end: "09:30"
      }],
      scheduleView: { start: 420, end: 1320, lastVisibleDay: 5 },
      gradeAttempts: [{
        id: "attempt-1",
        courseCode: "ICC103",
        periodId: "y1p2",
        grade: 92,
        createdAt: 1000
      }],
      advisorCourseProfiles: {
        ICC103: { difficultyOverride: "moderate", experience: "challenging" }
      },
      courseDifficultyOverrides: { ICC103: "demanding", ICC104: "light" },
      meta: {
        currentPeriod: "y1p2",
        loadPerTerm: "18",
        gpa: "3.45",
        internship: 120
      }
    } as Partial<PlannerState>;

    const normalized = normalizePlannerState(saved, ["MAT311", "ILE203", "ILE311"]);

    expect(normalized.courseStates).toEqual(saved.courseStates);
    expect(normalized.selections).toEqual(saved.selections);
    expect(normalized.externalDone).toMatchObject({
      MAT311: true,
      ILE203: true,
      ILE311: true
    });
    expect(normalized.scheduleEvents).toEqual(saved.scheduleEvents);
    expect(normalized.scheduleView).toEqual(saved.scheduleView);
    expect(normalized.gradeAttempts).toEqual(saved.gradeAttempts);
    expect(normalized.meta).toMatchObject({
      currentPeriod: "y1p2",
      loadPerTerm: "18",
      gpa: "3.45",
      internship: 120
    });
    expect(normalized.advisorCourseProfiles?.ICC103).toEqual({
      difficultyOverride: "moderate",
      experience: "challenging"
    });
    expect(normalized.advisorCourseProfiles?.ICC104?.difficultyOverride).toBe("light");
    expect(normalized.courseDifficultyOverrides).toBeUndefined();
  });

  it("restaura valores seguros cuando el rango del horario guardado es inválido", () => {
    const normalized = normalizePlannerState({
      scheduleView: { start: 1200, end: 360, lastVisibleDay: 4 }
    }, []);

    expect(normalized.scheduleView).toEqual({
      start: 360,
      end: 1200,
      lastVisibleDay: 4
    });
  });

  it("completa el estado mínimo sin descartar los requisitos de admisión", () => {
    const normalized = normalizePlannerState(null, ["MAT311", "ILE203", "ILE311"]);

    expect(normalized.courseStates).toEqual({});
    expect(normalized.selections).toEqual({});
    expect(normalized.externalDone).toEqual({
      MAT311: true,
      ILE203: true,
      ILE311: false
    });
    expect(normalized.scheduleEvents).toEqual([]);
    expect(normalized.gradeAttempts).toEqual([]);
  });
});
