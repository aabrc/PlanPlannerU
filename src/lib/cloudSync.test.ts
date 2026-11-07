import { describe, expect, it } from "vitest";
import { normalizePlannerState } from "./storage";
import {
  arePlannerStatesEqual,
  decideSyncAction,
  hasPlannerData
} from "./cloudSync";
import type { PlannerState } from "../types";

const EXTERNAL_CODES = ["MAT311", "ILE203", "ILE311"];

function blankState(): PlannerState {
  return normalizePlannerState({}, EXTERNAL_CODES);
}

describe("cloud planner synchronization decisions", () => {
  it("does not treat admission requirements auto-completed as user progress", () => {
    const state = blankState();

    expect(state.externalDone.MAT311).toBe(true);
    expect(state.externalDone.ILE203).toBe(true);
    expect(hasPlannerData(state)).toBe(false);
  });

  it("detects academic progress, electives, external requirements, schedule, grades, profiles and meta", () => {
    const cases: Partial<PlannerState>[] = [
      { courseStates: { ICC103: "approved" } },
      { selections: { "ITT-E01-T": "ITT403" } },
      { externalDone: { ILE311: true } },
      { scheduleEvents: [{ id: "e1", title: "Estudio", days: ["mon"], start: "08:00", end: "09:00" }] },
      { gradeAttempts: [{ id: "g1", courseCode: "ICC103", periodId: "y1p2", grade: 90, createdAt: 1 }] },
      { advisorCourseProfiles: { ICC103: { difficultyOverride: "moderate" } } },
      { meta: { ...blankState().meta, currentPeriod: "y1p2" } },
      { meta: { ...blankState().meta, loadPerTerm: "22" } }
    ];

    for (const patch of cases) {
      expect(hasPlannerData({ ...blankState(), ...patch })).toBe(true);
    }
  });

  it("ignores local timestamps and revision metadata when comparing planner content", () => {
    const first = {
      ...blankState(),
      courseStates: { ICC103: "approved" as const },
      _syncUpdatedAt: 100,
      _syncRevision: 3
    };
    const second = {
      ...blankState(),
      courseStates: { ICC103: "approved" as const },
      _syncUpdatedAt: 900,
      _syncRevision: 8
    };

    expect(arePlannerStatesEqual(first, second)).toBe(true);
  });

  it("compares nested planner state without depending on object key order", () => {
    const first = {
      ...blankState(),
      courseStates: { ICC103: "approved" as const, ITT112: "inprogress" as const }
    };
    const second = {
      ...blankState(),
      courseStates: { ITT112: "inprogress" as const, ICC103: "approved" as const }
    };

    expect(arePlannerStatesEqual(first, second)).toBe(true);
  });

  it("recognizes different academic progress as a real change", () => {
    const first = { ...blankState(), courseStates: { ICC103: "approved" as const } };
    const second = { ...blankState(), courseStates: { ICC103: "inprogress" as const } };

    expect(arePlannerStatesEqual(first, second)).toBe(false);
  });

  it("downloads cloud progress when the local device has no progress", () => {
    const local = blankState();
    const remote = { ...blankState(), courseStates: { ICC103: "approved" as const }, _syncRevision: 2 };

    expect(decideSyncAction(local, remote)).toBe("download");
  });

  it("asks before replacing an existing empty cloud row with first-login local progress", () => {
    const local = { ...blankState(), courseStates: { ICC103: "approved" as const } };
    const remote = { ...blankState(), _syncRevision: 1 };

    expect(decideSyncAction(local, remote)).toBe("conflict");
  });

  it("asks before replacing populated cloud progress with an empty previously-synced local state", () => {
    const local = { ...blankState(), _syncRevision: 4 };
    const remote = { ...blankState(), courseStates: { ICC103: "approved" as const }, _syncRevision: 4 };

    expect(decideSyncAction(local, remote)).toBe("conflict");
  });

  it("marks two empty snapshots as synchronized", () => {
    const local = { ...blankState(), _syncRevision: 3 };
    const remote = { ...blankState(), _syncRevision: 3 };

    expect(decideSyncAction(local, remote)).toBe("synced");
  });

  it("does not overwrite two populated states on first login without explicit choice", () => {
    const local = { ...blankState(), courseStates: { ICC103: "approved" as const } };
    const remote = { ...blankState(), courseStates: { ITT112: "approved" as const }, _syncRevision: 4 };

    expect(decideSyncAction(local, remote)).toBe("conflict");
  });

  it("detects a cloud revision newer than the local snapshot", () => {
    const local = { ...blankState(), courseStates: { ICC103: "approved" as const }, _syncRevision: 4 };
    const remote = { ...blankState(), courseStates: { ITT112: "approved" as const }, _syncRevision: 5 };

    expect(decideSyncAction(local, remote)).toBe("conflict");
  });

  it("does not upload stale local progress over a newer empty cloud state", () => {
    const local = { ...blankState(), courseStates: { ICC103: "approved" as const }, _syncRevision: 4 };
    const remote = { ...blankState(), _syncRevision: 5 };

    expect(decideSyncAction(local, remote)).toBe("conflict");
  });

  it("does not silently download over an empty local state with a stale revision", () => {
    const local = { ...blankState(), _syncRevision: 4 };
    const remote = { ...blankState(), courseStates: { ITT112: "approved" as const }, _syncRevision: 5 };

    expect(decideSyncAction(local, remote)).toBe("conflict");
  });

  it("marks equal revisions and equal planner content as synchronized", () => {
    const local = { ...blankState(), courseStates: { ICC103: "approved" as const }, _syncRevision: 4 };
    const remote = { ...blankState(), courseStates: { ICC103: "approved" as const }, _syncRevision: 4 };

    expect(decideSyncAction(local, remote)).toBe("synced");
  });

  it("uploads local edits when both snapshots share the same last-synced revision", () => {
    const local = { ...blankState(), courseStates: { ICC103: "approved" as const }, _syncRevision: 4 };
    const remote = { ...blankState(), courseStates: { ICC103: "inprogress" as const }, _syncRevision: 4 };

    expect(decideSyncAction(local, remote)).toBe("upload");
  });

  it("includes a customized schedule view in the synchronized planner data", () => {
    const local = {
      ...blankState(),
      scheduleView: { start: 480, end: 1080, lastVisibleDay: 4 }
    };

    expect(hasPlannerData(local)).toBe(true);
  });
});
