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
  it("descarta estructuras inválidas sin alterar los datos válidos", () => {
    const normalized = normalizePlannerState({
      courseStates: {
        ICC103: "approved",
        ICC104: "invented",
        ICC105: 1
      },
      selections: {
        "ITT-E01-T": "ITT403",
        "ITT-E02-T": 42,
        "": "ICC104"
      },
      externalDone: {
        MAT311: false,
        ILE203: "false",
        ILE311: true,
        UNKNOWN: true
      },
      scheduleEvents: [
        {
          id: "event-1",
          title: "Clase válida",
          courseCode: "ICC103",
          days: ["mon", "wed", "invalid", "mon"],
          start: "08:00",
          end: "10:00",
          color: "blue"
        },
        { id: "event-2", title: "Hora dañada", days: ["noday"], start: "99:99", end: "10:90" },
        null,
        { id: "event-3", title: "" }
      ],
      gradeAttempts: [
        { id: "valid", courseCode: "ICC103", periodId: "y1p2", grade: 90, createdAt: 100 },
        { id: "bad-grade", courseCode: "ICC104", periodId: "y1p2", grade: 150, createdAt: 101 },
        { id: "bad-time", courseCode: "ICC105", periodId: "y1p2", grade: 80, createdAt: "yesterday" }
      ],
      meta: {
        currentPeriod: 12,
        loadPerTerm: "99",
        gpa: "5.8",
        internship: -20
      }
    } as unknown as Partial<PlannerState>, ["MAT311", "ILE203", "ILE311"]);

    expect(normalized.courseStates).toEqual({ ICC103: "approved" });
    expect(normalized.selections).toEqual({ "ITT-E01-T": "ITT403" });
    expect(normalized.externalDone).toEqual({ MAT311: true, ILE203: true, ILE311: true });
    expect(normalized.scheduleEvents).toEqual([{
      id: "event-1",
      title: "Clase válida",
      courseCode: "ICC103",
      days: ["mon", "wed"],
      start: "08:00",
      end: "10:00",
      color: "blue"
    }, {
      id: "event-2",
      title: "Hora dañada",
      days: []
    }]);
    expect(normalized.gradeAttempts).toEqual([{
      id: "valid",
      courseCode: "ICC103",
      periodId: "y1p2",
      grade: 90,
      createdAt: 100
    }]);
    expect(normalized.meta).toMatchObject({
      currentPeriod: "",
      loadPerTerm: "30",
      gpa: "4",
      internship: 0
    });
  });

  it("normaliza horas, notas, créditos y tiempos de forma segura", () => {
    const normalized = normalizePlannerState({
      scheduleEvents: [{
        id: "class-1",
        title: "Clase de medianoche",
        days: ["sun"],
        start: "22:30",
        end: "24:00",
        notes: "  Repasar  ",
        location: "  Laboratorio  ",
        color: "not-a-color"
      }],
      gradeAttempts: [
        { id: "older", courseCode: "MAT101", periodId: "y1p1", grade: 70, createdAt: 10 },
        { id: "newer", courseCode: "MAT101", periodId: "y1p1", grade: 95, createdAt: 20 }
      ],
      meta: { currentPeriod: " y1p2 ", loadPerTerm: "0", gpa: "-2", internship: "500" },
      _syncUpdatedAt: 1234
    } as unknown as Partial<PlannerState>, []);

    expect(normalized.scheduleEvents[0]).toMatchObject({
      start: "22:30",
      end: "24:00",
      notes: "Repasar",
      location: "Laboratorio"
    });
    expect(normalized.scheduleEvents[0].color).toBeUndefined();
    expect(normalized.gradeAttempts).toEqual([{
      id: "newer",
      courseCode: "MAT101",
      periodId: "y1p1",
      grade: 95,
      createdAt: 20
    }]);
    expect(normalized.meta).toMatchObject({
      currentPeriod: "y1p2",
      loadPerTerm: "1",
      gpa: "0",
      internship: 320
    });
    expect(normalized._syncUpdatedAt).toBe(1234);
  });

  it("preserves only valid positive safe-integer cloud revisions", () => {
    const valid = normalizePlannerState({ _syncRevision: 7 }, []);
    const fractional = normalizePlannerState({ _syncRevision: 1.5 }, []);
    const zero = normalizePlannerState({ _syncRevision: 0 }, []);
    const unsafe = normalizePlannerState({ _syncRevision: Number.MAX_SAFE_INTEGER + 1 }, []);

    expect(valid._syncRevision).toBe(7);
    expect(fractional._syncRevision).toBeUndefined();
    expect(zero._syncRevision).toBeUndefined();
    expect(unsafe._syncRevision).toBeUndefined();
  });

});
