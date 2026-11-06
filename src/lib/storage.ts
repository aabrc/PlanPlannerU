import type { CourseStatus, PlannerState } from "../types";

export const STORAGE_KEY = "itt2020_pensum_tracker_v2";

const AUTO_COMPLETED_EXTERNAL = ["MAT311", "ILE203"];

function blankState(externalCodes: string[]): PlannerState {
  const externalDone = Object.fromEntries(
    externalCodes.map((code) => [code, AUTO_COMPLETED_EXTERNAL.includes(code)])
  );
  return {
    courseStates: {},
    selections: {},
    externalDone,
    scheduleEvents: [],
    meta: { currentPeriod: "", loadPerTerm: "15", gpa: "", internship: 0 }
  };
}

export function normalizePlannerState(
  saved: Partial<PlannerState> | null | undefined,
  externalCodes: string[]
): PlannerState {
  const base = blankState(externalCodes);
  const externalDone = { ...base.externalDone, ...(saved?.externalDone || {}) };

  // These two requirements are recorded as fulfilled through the admission exam.
  for (const code of AUTO_COMPLETED_EXTERNAL) externalDone[code] = true;

  return {
    ...base,
    ...(saved || {}),
    courseStates: { ...(saved?.courseStates || {}) },
    selections: { ...(saved?.selections || {}) },
    externalDone,
    scheduleEvents: Array.isArray(saved?.scheduleEvents) ? saved.scheduleEvents : [],
    meta: { ...base.meta, ...(saved?.meta || {}) }
  };
}

export function loadPlannerState(externalCodes: string[]): PlannerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizePlannerState(JSON.parse(raw), externalCodes);
  } catch (error) {
    console.warn("No se pudo leer el progreso guardado de PlanPlannerU.", error);
  }

  // Compatibility with the earliest tracker format.
  const migrated = blankState(externalCodes);
  try {
    const old = JSON.parse(localStorage.getItem("pensum_states") || "{}") as Record<string, CourseStatus>;
    const aliases: Record<string, string> = {
      DEP102: "1DEP102",
      ITT363: "1ITT363",
      ITT465: "1ITT465",
      ITT466: "1ITT466",
      ITT467: "1ITT467"
    };
    const paired: Record<string, string[]> = {
      ITT112: ["ITT112", "1ITT112"],
      FIS139: ["FIS139", "1FIS139"],
      ITT113: ["ITT113", "1ITT113"],
      FIS219: ["FIS219", "1FIS219"],
      ITT241: ["ITT241", "1ITT241"],
      IEL211: ["IEL211", "1IEL211"],
      FIS229: ["FIS229", "1FIS229"],
      ITT213: ["ITT213", "1ITT213"],
      IEL222: ["IEL222", "1IEL222"],
      ITT321: ["ITT321", "1ITT321"],
      ITT344: ["ITT344", "1ITT344"],
      ITT324: ["ITT324", "1ITT324"],
      ITT314: ["ITT314", "1ITT314"],
      ITT315: ["ITT315", "1ITT315"],
      ITT355: ["ITT355", "1ITT355"],
      ITT456: ["ITT456", "1ITT456"]
    };
    const valid = new Set(["pending", "inprogress", "approved"]);
    for (const [oldCode, status] of Object.entries(old)) {
      if (!valid.has(status)) continue;
      const target = aliases[oldCode] || oldCode;
      if (paired[oldCode]) {
        for (const code of paired[oldCode]) migrated.courseStates[code] = status;
      } else {
        migrated.courseStates[target] = status;
      }
    }

    const oldGroupMap: Record<string, string> = {
      "1DEP102": "DEP-E01-P",
      FIL113: "FIL-E11-T",
      HG107: "HG-E01-T",
      ART107: "ART-E01-T",
      LET126: "LIT-E01-T",
      CN112: "CN-E01-T",
      HG106: "HG-E02-T",
      CHU106: "CHU-E01-T",
      ET207: "ET-E21-T",
      ET229: "ET-E22-T"
    };
    for (const [code, groupId] of Object.entries(oldGroupMap)) {
      if (migrated.courseStates[code]) migrated.selections[groupId] = code;
    }
    if (migrated.courseStates.CN112) {
      migrated.selections["CN-E01-P"] = "1CN112";
      migrated.courseStates["1CN112"] = migrated.courseStates.CN112;
    }
    if (Object.keys(migrated.courseStates).length || Object.keys(migrated.selections).length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    }
  } catch (error) {
    console.warn("No se pudo migrar el formato antiguo de progreso.", error);
  }

  return normalizePlannerState(migrated, externalCodes);
}

export function savePlannerState(state: PlannerState): boolean {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, _syncUpdatedAt: Date.now() })
    );
    return true;
  } catch (error) {
    console.error("No se pudo guardar el progreso local.", error);
    return false;
  }
}

export function downloadBackup(state: PlannerState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "PlanPlannerU-respaldo.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readBackup(file: File, externalCodes: string[]): Promise<PlannerState> {
  const text = await file.text();
  return normalizePlannerState(JSON.parse(text), externalCodes);
}
