import type {
  Course,
  CourseDifficultyOverride,
  CurriculumPlan,
  PlannerState
} from "../types";

export type WorkloadLevel = "Ligera" | "Moderada" | "Exigente";
export type IndexImpactLevel = "Alto" | "Medio" | "Bajo" | "Sin impacto directo";

export interface CourseDifficultyEstimate {
  level: WorkloadLevel;
  score: number;
  source: "automática" | "ajustada por ti";
  override: CourseDifficultyOverride | null;
}

export interface AdvisorRecommendation {
  course: Course;
  unlocks: number;
  directUnlocks: number;
  periodLabel: string;
  difficulty: CourseDifficultyEstimate;
  indexImpact: IndexImpactLevel;
  fitsTarget: boolean;
  reasons: string[];
  priorityScore: number;
}

export interface AcademicAdvice {
  recommendations: AdvisorRecommendation[];
  laggedCourses: AdvisorRecommendation[];
  hasCurrentPeriod: boolean;
  targetCredits: number;
  activeCredits: number;
  remainingCredits: number;
  paceLabel: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function periodLabelForCourse(plan: CurriculumPlan, code: string): string {
  const period = plan.periods.find((item) =>
    item.courses.some((course) => course.code === code) ||
    item.groups.some((groupId) =>
      plan.groups.find((group) => group.id === groupId)?.options.some((course) => course.code === code)
    )
  );
  return period?.label || "Electiva seleccionada";
}

function approvedCredits(plan: CurriculumPlan, state: PlannerState): number {
  const courses = new Map<string, Course>();
  for (const period of plan.periods) {
    for (const course of period.courses) courses.set(course.code, course);
  }
  for (const group of plan.groups) {
    for (const course of group.options) courses.set(course.code, course);
  }

  const counted = new Set<string>();
  let total = 0;
  for (const period of plan.periods) {
    for (const course of period.courses) {
      if (state.courseStates[course.code] === "approved" && !counted.has(course.code)) {
        counted.add(course.code);
        total += course.credits;
      }
    }
  }
  for (const code of Object.values(state.selections)) {
    const course = courses.get(code);
    if (course && state.courseStates[code] === "approved" && !counted.has(code)) {
      counted.add(code);
      total += course.credits;
    }
  }
  return total;
}

function estimateDifficulty(
  course: Course,
  override?: CourseDifficultyOverride
): CourseDifficultyEstimate {
  const overrideScores: Record<CourseDifficultyOverride, number> = {
    light: 1.7,
    moderate: 3,
    demanding: 4.3
  };

  if (override) {
    const score = overrideScores[override];
    return {
      score,
      level: score <= 2.3 ? "Ligera" : score <= 3.5 ? "Moderada" : "Exigente",
      source: "ajustada por ti",
      override
    };
  }

  const metadata = course.advisorProfile;
  let score: number;

  if (typeof metadata?.difficulty === "number" &&
      Number.isFinite(metadata.difficulty) &&
      metadata.difficulty >= 1 &&
      metadata.difficulty <= 5) {
    score = metadata.difficulty;
  } else if (metadata?.courseType === "lab" || course.credits === 0 || /laboratorio/i.test(course.name)) {
    score = 2;
  } else {
    const description = (course.code + " " + course.name).normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase();

    if (/calculo|ecuacion|algebra|probabilidad|estadistica|fisica|circuito|electronica|electromagnetismo|senales|procesos estocasticos/.test(description) ||
        /^(MAT|FIS|IEL)/.test(course.code)) {
      score = 4.15;
    } else if (/programacion|algoritmo|estructura de datos|base de datos|redes|seguridad|sistemas|telecomunicacion|comunicacion|automatizacion|centro de datos/.test(description) ||
        /^(ICC|ITT)/.test(course.code)) {
      score = 3.65;
    } else {
      // No subject family (including languages or electives) is presumed easy.
      // Without stronger evidence, use a neutral starting point.
      score = 2.8;
    }
  }

  // Credits add only a small adjustment. They never determine the difficulty category.
  if (course.credits >= 4) score += 0.12;
  else if (course.credits === 3) score += 0.05;
  else if (course.credits <= 1) score -= 0.2;

  score = clamp(score, 1, 5);
  return {
    score,
    level: score <= 2.3 ? "Ligera" : score <= 3.5 ? "Moderada" : "Exigente",
    source: "automática",
    override: null
  };
}

function indexImpact(credits: number): IndexImpactLevel {
  if (credits >= 4) return "Alto";
  if (credits >= 3) return "Medio";
  if (credits > 0) return "Bajo";
  return "Sin impacto directo";
}

function blockersFor(
  course: Course,
  state: PlannerState,
  courseByCode: Map<string, Course>,
  approved: number,
  totalCredits: number
): string[] {
  const blockers: string[] = [];
  for (const requirement of course.req || []) {
    if (courseByCode.has(requirement)) {
      if (state.courseStates[requirement] !== "approved") blockers.push(requirement);
    } else if (!state.externalDone[requirement]) {
      blockers.push(requirement);
    }
  }

  if (course.gate && typeof course.gate === "object") {
    const percent = Number((course.gate as { percent?: number }).percent || 0);
    const needed = Math.ceil(totalCredits * percent / 100);
    if (approved < needed) blockers.push(percent + "% del plan (" + needed + " créditos)");
  }
  return blockers;
}

function countDownstream(
  code: string,
  dependents: Map<string, Set<string>>,
  visited = new Set<string>()
): number {
  let total = 0;
  for (const dependent of dependents.get(code) || []) {
    if (visited.has(dependent)) continue;
    visited.add(dependent);
    total += 1 + countDownstream(dependent, dependents, visited);
  }
  return total;
}

export function buildAcademicAdvice(
  plan: CurriculumPlan,
  state: PlannerState
): AcademicAdvice {
  const allCourses = new Map<string, Course>();
  for (const period of plan.periods) {
    for (const course of period.courses) allCourses.set(course.code, course);
  }
  for (const group of plan.groups) {
    for (const course of group.options) allCourses.set(course.code, course);
  }

  const selectedElectives = plan.groups
    .map((group) => {
      const code = state.selections[group.id];
      return code ? allCourses.get(code) : undefined;
    })
    .filter((course): course is Course => Boolean(course));
  const candidates = Array.from(new Map(
    [...plan.periods.flatMap((period) => period.courses), ...selectedElectives]
      .map((course) => [course.code, course])
  ).values());

  const dependents = new Map<string, Set<string>>();
  for (const course of candidates) {
    for (const requirement of course.req || []) {
      if (!allCourses.has(requirement)) continue;
      const list = dependents.get(requirement) || new Set<string>();
      list.add(course.code);
      dependents.set(requirement, list);
    }
  }

  const approved = approvedCredits(plan, state);
  const currentPeriodIndex = plan.periods.findIndex(
    (period) => period.id === state.meta.currentPeriod
  );
  const targetValue = Number(state.meta.loadPerTerm);
  const targetCredits = Number.isFinite(targetValue) && targetValue > 0
    ? clamp(targetValue, 1, 30)
    : 15;
  const activeCodes = new Set(
    Object.entries(state.courseStates)
      .filter(([, status]) => status === "inprogress")
      .map(([code]) => code)
  );
  const activeCredits = Array.from(activeCodes).reduce(
    (total, code) => total + (allCourses.get(code)?.credits || 0),
    0
  );
  const remainingCredits = Math.max(0, targetCredits - activeCredits);
  const paceLabel = targetCredits <= 12
    ? "Ritmo ligero"
    : targetCredits <= 18
      ? "Ritmo equilibrado"
      : "Ritmo intensivo";

  const ranked = candidates
    .filter((course) =>
      state.courseStates[course.code] !== "approved" &&
      state.courseStates[course.code] !== "inprogress" &&
      blockersFor(course, state, allCourses, approved, plan.totalCredits).length === 0
    )
    .map((course): AdvisorRecommendation => {
      const coursePeriodIndex = plan.periods.findIndex((period) =>
        period.courses.some((item) => item.code === course.code)
      );
      const isLagged = currentPeriodIndex >= 0 &&
        coursePeriodIndex >= 0 &&
        coursePeriodIndex < currentPeriodIndex;
      const directUnlocks = (dependents.get(course.code) || new Set<string>()).size;
      const unlocks = countDownstream(course.code, dependents);
      const difficulty = estimateDifficulty(
        course,
        state.courseDifficultyOverrides?.[course.code]
      );
      const fitsTarget = course.credits === 0 ||
        activeCredits + course.credits <= targetCredits;

      let priorityScore = (isLagged ? 32 : 12) +
        Math.min(directUnlocks, 3) * 7 +
        Math.min(unlocks, 6) * 3 +
        (fitsTarget ? 5 : -5);

      if (targetCredits <= 12) {
        priorityScore += difficulty.score <= 2.3 ? 7 : difficulty.score >= 3.8 ? -7 : 0;
      } else if (targetCredits > 18) {
        priorityScore += difficulty.score >= 3.8 ? 3 : 0;
      } else if (difficulty.score >= 2.4 && difficulty.score <= 3.5) {
        priorityScore += 2;
      }

      const reasons: string[] = [];
      if (isLagged) reasons.push("Pendiente de un período anterior");
      if (directUnlocks > 0) {
        reasons.push("Es prerrequisito directo de " + directUnlocks +
          (directUnlocks === 1 ? " asignatura" : " asignaturas"));
      } else if (unlocks > 0) {
        reasons.push("Abre camino a " + unlocks +
          (unlocks === 1 ? " materia relacionada" : " materias relacionadas"));
      }
      if (!fitsTarget && course.credits > 0) {
        reasons.push("Supera el espacio restante de tu meta de créditos");
      } else {
        reasons.push("Cabe dentro de tu meta de carga actual");
      }
      if (course.credits >= 4) {
        reasons.push("Sus 4 o más créditos dan mayor peso a la nota en tu índice, tanto a favor como en contra");
      } else if (course.credits >= 3) {
        reasons.push("Su peso en el índice es intermedio; la nota obtenida determinará el efecto real");
      } else if (course.credits > 0) {
        reasons.push("Su peso directo en el índice es menor por tener pocos créditos");
      }

      return {
        course,
        unlocks,
        directUnlocks,
        periodLabel: periodLabelForCourse(plan, course.code),
        difficulty,
        indexImpact: indexImpact(course.credits),
        fitsTarget,
        reasons,
        priorityScore
      };
    })
    .sort((a, b) =>
      b.priorityScore - a.priorityScore ||
      a.difficulty.score - b.difficulty.score ||
      a.course.code.localeCompare(b.course.code)
    );

  const laggedCourses = ranked
    .filter((item) => {
      const courseIndex = plan.periods.findIndex((period) =>
        period.courses.some((course) => course.code === item.course.code)
      );
      return currentPeriodIndex >= 0 && courseIndex >= 0 && courseIndex < currentPeriodIndex;
    })
    .slice(0, 6);

  return {
    recommendations: ranked.slice(0, 4),
    laggedCourses,
    hasCurrentPeriod: currentPeriodIndex >= 0,
    targetCredits,
    activeCredits,
    remainingCredits,
    paceLabel
  };
}
