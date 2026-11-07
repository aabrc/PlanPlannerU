import type {
  AdvisorChallengeFactor,
  AdvisorCourseExperience,
  AdvisorCourseProfile,
  AdvisorReadiness,
  CourseDifficultyOverride,
  CourseStatus,
  PlannerState
} from "../types";

export const STORAGE_KEY = "itt2020_pensum_tracker_v2";

const AUTO_COMPLETED_EXTERNAL = ["MAT311", "ILE203"];

type UnknownRecord = Record<string, unknown>;

const VALID_COURSE_STATUSES: CourseStatus[] = ["pending", "inprogress", "approved"];
const VALID_DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const VALID_EVENT_COLORS = new Set([
  "blue", "sky", "cyan", "teal", "green", "lime", "yellow", "amber",
  "orange", "coral", "red", "rose", "pink", "purple", "violet", "slate"
]);
const MAX_SCHEDULE_EVENTS = 500;
const MAX_GRADE_ATTEMPTS = 1000;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeKey(value: string): boolean {
  return value.length > 0 &&
    value.length <= 160 &&
    value !== "__proto__" &&
    value !== "prototype" &&
    value !== "constructor";
}

function optionalString(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeClock(value: unknown, allowEndOfDay = false): string | undefined {
  if (typeof value !== "string" || value === "") return value === "" ? "" : undefined;
  if (allowEndOfDay && value === "24:00") return value;
  return /^([01]\\d|2[0-3]):[0-5]\\d$/.test(value) ? value : undefined;
}

function normalizeCourseStates(value: unknown): Record<string, CourseStatus> {
  if (!isRecord(value)) return {};
  const result: Record<string, CourseStatus> = {};

  for (const [code, status] of Object.entries(value)) {
    if (safeKey(code) && VALID_COURSE_STATUSES.includes(status as CourseStatus)) {
      result[code] = status as CourseStatus;
    }
  }

  return result;
}

function normalizeSelections(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};

  for (const [groupId, courseCode] of Object.entries(value)) {
    const selectedCode = optionalString(courseCode, 80);
    if (safeKey(groupId) && selectedCode) result[groupId] = selectedCode;
  }

  return result;
}

function normalizeExternalDone(value: unknown, externalCodes: string[]): Record<string, boolean> {
  const saved = isRecord(value) ? value : {};
  const result: Record<string, boolean> = {};

  for (const code of externalCodes) {
    result[code] = typeof saved[code] === "boolean"
      ? saved[code] as boolean
      : AUTO_COMPLETED_EXTERNAL.includes(code);
  }

  for (const code of AUTO_COMPLETED_EXTERNAL) {
    if (externalCodes.includes(code)) result[code] = true;
  }

  return result;
}

function normalizeScheduleEvents(value: unknown): ScheduleEvent[] {
  if (!Array.isArray(value)) return [];
  const result: ScheduleEvent[] = [];
  const usedIds = new Set<string>();

  for (const [index, rawEvent] of value.slice(0, MAX_SCHEDULE_EVENTS).entries()) {
    if (!isRecord(rawEvent)) continue;

    const title = optionalString(rawEvent.title, 120);
    const courseCode = optionalString(rawEvent.courseCode, 80);
    if (!title) continue;

    let id = optionalString(rawEvent.id, 120) || "event-" + (index + 1);
    if (!safeKey(id)) id = "event-" + (index + 1);
    if (usedIds.has(id)) {
      let suffix = 2;
      while (usedIds.has(id + "-" + suffix)) suffix += 1;
      id = id + "-" + suffix;
    }
    usedIds.add(id);

    const event: ScheduleEvent = {
      id,
      title,
      ...(courseCode ? { courseCode } : {})
    };

    const kind = optionalString(rawEvent.kind, 40);
    if (kind) event.kind = kind;

    if (Array.isArray(rawEvent.days)) {
      event.days = Array.from(new Set(
        rawEvent.days.filter((day): day is string =>
          typeof day === "string" && VALID_DAYS.has(day)
        )
      ));
    }

    const start = normalizeClock(rawEvent.start);
    const end = normalizeClock(rawEvent.end, true);
    if (start !== undefined) event.start = start;
    if (end !== undefined) event.end = end;

    const location = optionalString(rawEvent.location, 160);
    const notes = optionalString(rawEvent.notes, 1000);
    const color = optionalString(rawEvent.color, 30);
    if (location) event.location = location;
    if (notes) event.notes = notes;
    if (color && VALID_EVENT_COLORS.has(color)) event.color = color;

    result.push(event);
  }

  return result;
}

function normalizeGradeAttempts(value: unknown): GradeAttempt[] {
  if (!Array.isArray(value)) return [];
  const latestByCoursePeriod = new Map<string, GradeAttempt>();

  for (const [index, rawAttempt] of value.slice(0, MAX_GRADE_ATTEMPTS).entries()) {
    if (!isRecord(rawAttempt)) continue;
    const courseCode = optionalString(rawAttempt.courseCode, 80);
    const periodId = optionalString(rawAttempt.periodId, 80);
    const grade = finiteNumber(rawAttempt.grade);
    const createdAt = finiteNumber(rawAttempt.createdAt);

    if (!courseCode || !periodId || grade === undefined || grade < 0 || grade > 100 ||
      createdAt === undefined || createdAt < 0) {
      continue;
    }

    const key = courseCode + "::" + periodId;
    const id = optionalString(rawAttempt.id, 160) || "attempt-" + (index + 1);
    const candidate: GradeAttempt = { id, courseCode, periodId, grade, createdAt };
    const previous = latestByCoursePeriod.get(key);

    if (!previous || candidate.createdAt >= previous.createdAt) {
      latestByCoursePeriod.set(key, candidate);
    }
  }

  return Array.from(latestByCoursePeriod.values());
}

function normalizeMeta(value: unknown, fallback: PlannerState["meta"]): PlannerState["meta"] {
  const saved = isRecord(value) ? value : {};
  const load = finiteNumber(saved.loadPerTerm);
  const gpa = finiteNumber(saved.gpa);
  const internship = finiteNumber(saved.internship);
  const normalizedLoad = load === undefined
    ? 15
    : Math.max(1, Math.min(30, Math.floor(load)));

  return {
    ...fallback,
    ...saved,
    currentPeriod: optionalString(saved.currentPeriod, 80) || "",
    loadPerTerm: String(normalizedLoad),
    gpa: saved.gpa === "" || saved.gpa === null || saved.gpa === undefined || gpa === undefined
      ? ""
      : String(Math.max(0, Math.min(4, gpa))),
    internship: internship === undefined
      ? 0
      : Math.floor(Math.max(0, Math.min(320, internship)))
  };
}

function normalizeAdvisorProfiles(saved: UnknownRecord): Record<string, AdvisorCourseProfile> {
  const validDifficultyOverrides: CourseDifficultyOverride[] = ["light", "moderate", "demanding"];
  const validReadiness: AdvisorReadiness[] = ["prepared", "some-gaps", "needs-review"];
  const validExperiences: AdvisorCourseExperience[] = [
    "not-started",
    "manageable",
    "as-expected",
    "challenging"
  ];
  const validChallengeFactors: AdvisorChallengeFactor[] = [
    "foundations",
    "teaching-method",
    "assessments",
    "practical-skills",
    "time-constraints"
  ];
  const advisorCourseProfiles: Record<string, AdvisorCourseProfile> = {};
  const savedProfiles = isRecord(saved.advisorCourseProfiles) ? saved.advisorCourseProfiles : {};

  for (const [code, rawProfile] of Object.entries(savedProfiles)) {
    if (!safeKey(code) || !isRecord(rawProfile)) continue;
    const profile = rawProfile;
    const normalized: AdvisorCourseProfile = {};

    if (validDifficultyOverrides.includes(profile.difficultyOverride as CourseDifficultyOverride)) {
      normalized.difficultyOverride = profile.difficultyOverride as CourseDifficultyOverride;
    }
    if (validReadiness.includes(profile.readiness as AdvisorReadiness)) {
      normalized.readiness = profile.readiness as AdvisorReadiness;
    }
    if (validExperiences.includes(profile.experience as AdvisorCourseExperience)) {
      normalized.experience = profile.experience as AdvisorCourseExperience;
    }
    if (Array.isArray(profile.challengeFactors)) {
      normalized.challengeFactors = Array.from(new Set(
        profile.challengeFactors.filter((factor): factor is AdvisorChallengeFactor =>
          validChallengeFactors.includes(factor as AdvisorChallengeFactor)
        )
      ));
      if (normalized.challengeFactors.length === 0) delete normalized.challengeFactors;
    }

    if (Object.keys(normalized).length > 0) advisorCourseProfiles[code] = normalized;
  }

  // Migrate previously saved personal difficulty adjustments without losing them.
  const oldOverrides = isRecord(saved.courseDifficultyOverrides) ? saved.courseDifficultyOverrides : {};
  for (const [code, value] of Object.entries(oldOverrides)) {
    if (!safeKey(code) || !validDifficultyOverrides.includes(value as CourseDifficultyOverride)) continue;
    const current = advisorCourseProfiles[code] || {};
    if (!current.difficultyOverride) {
      advisorCourseProfiles[code] = { ...current, difficultyOverride: value as CourseDifficultyOverride };
    }
  }

  return advisorCourseProfiles;
}

function normalizeScheduleView(saved: unknown): { start: number; end: number; lastVisibleDay: number } {
  const record = isRecord(saved) ? saved : {};
  const savedStart = record.start;
  const savedEnd = record.end;
  const savedLastDay = record.lastVisibleDay;

  const start =
    typeof savedStart === "number" &&
    Number.isInteger(savedStart) &&
    savedStart >= 0 &&
    savedStart < 1440 &&
    savedStart % 30 === 0
      ? savedStart
      : 360;
  const end =
    typeof savedEnd === "number" &&
    Number.isInteger(savedEnd) &&
    savedEnd > 0 &&
    savedEnd <= 1440 &&
    savedEnd % 30 === 0
      ? savedEnd
      : 1200;
  const lastVisibleDay =
    typeof savedLastDay === "number" &&
    Number.isInteger(savedLastDay) &&
    savedLastDay >= 0 &&
    savedLastDay <= 6
      ? savedLastDay
      : 6;

  if (end <= start) return { start: 360, end: 1200, lastVisibleDay };
  return { start, end, lastVisibleDay };
}
function blankState(externalCodes: string[]): PlannerState {
  const externalDone = Object.fromEntries(
    externalCodes.map((code) => [code, AUTO_COMPLETED_EXTERNAL.includes(code)])
  );
  return {
    courseStates: {},
    selections: {},
    externalDone,
    scheduleEvents: [],
    scheduleView: { start: 360, end: 1200, lastVisibleDay: 6 },
    gradeAttempts: [],
    advisorCourseProfiles: {},
    meta: { currentPeriod: "", loadPerTerm: "15", gpa: "", internship: 0 }
  };
}

export function normalizePlannerState(
  saved: Partial<PlannerState> | null | undefined,
  externalCodes: string[]
): PlannerState {
  const record = isRecord(saved) ? saved : {};
  const base = blankState(externalCodes);
  const syncUpdatedAt = finiteNumber(record._syncUpdatedAt);

  return {
    ...base,
    courseStates: normalizeCourseStates(record.courseStates),
    selections: normalizeSelections(record.selections),
    externalDone: normalizeExternalDone(record.externalDone, externalCodes),
    scheduleEvents: normalizeScheduleEvents(record.scheduleEvents),
    scheduleView: normalizeScheduleView(record.scheduleView),
    gradeAttempts: normalizeGradeAttempts(record.gradeAttempts),
    advisorCourseProfiles: normalizeAdvisorProfiles(record),
    meta: normalizeMeta(record.meta, base.meta),
    ...(syncUpdatedAt !== undefined && syncUpdatedAt >= 0 ? { _syncUpdatedAt: syncUpdatedAt } : {})
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
