import { advisorInsightKey, MIN_COMMUNITY_INSIGHT_RESPONSES } from "./advisorInsights";
import type {
  AdvisorCommunityInsight,
  AdvisorChallengeFactor,
  AdvisorCourseProfile,
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
  source: "automática" | "ajustada por ti" | "experiencia compartida";
  override: CourseDifficultyOverride | null;
  sampleCount?: number;
}

export interface AdvisorRecommendation {
  course: Course;
  unlocks: number;
  directUnlocks: number;
  blockers: string[];
  canEnroll: boolean;
  periodLabel: string;
  difficulty: CourseDifficultyEstimate;
  indexImpact: IndexImpactLevel;
  fitsTarget: boolean;
  reasons: string[];
  priorityScore: number;
  profile: AdvisorCourseProfile;
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

const CHALLENGE_FACTOR_LABELS: Record<AdvisorChallengeFactor, string> = {
  foundations: "fundamentos previos",
  "teaching-method": "metodología de enseñanza",
  assessments: "evaluaciones",
  "practical-skills": "práctica y desarrollo de habilidades",
  "time-constraints": "tiempo y otras responsabilidades"
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function periodForCourse(plan: CurriculumPlan, code: string) {
  return plan.periods.find((item) =>
    item.courses.some((course) => course.code === code) ||
    item.groups.some((groupId) =>
      plan.groups.find((group) => group.id === groupId)?.options.some((course) => course.code === code)
    )
  );
}

function periodLabelForCourse(plan: CurriculumPlan, code: string): string {
  return periodForCourse(plan, code)?.label || "Electiva seleccionada";
}

function comparePeriodPositions(
  periodA: CurriculumPlan["periods"][number] | undefined,
  periodB: CurriculumPlan["periods"][number] | undefined
): number {
  const yearA = periodA?.year ?? Number.MAX_SAFE_INTEGER;
  const yearB = periodB?.year ?? Number.MAX_SAFE_INTEGER;
  const termA = periodA?.term ?? Number.MAX_SAFE_INTEGER;
  const termB = periodB?.term ?? Number.MAX_SAFE_INTEGER;

  return yearA - yearB || termA - termB;
}

function compareCoursePeriods(
  plan: CurriculumPlan,
  codeA: string,
  codeB: string
): number {
  return comparePeriodPositions(
    periodForCourse(plan, codeA),
    periodForCourse(plan, codeB)
  );
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
  profile?: AdvisorCourseProfile,
  communityInsight?: AdvisorCommunityInsight
): CourseDifficultyEstimate {
  const override = profile?.difficultyOverride;
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

  if (communityInsight &&
      communityInsight.responseCount >= MIN_COMMUNITY_INSIGHT_RESPONSES &&
      Number.isFinite(communityInsight.meanDifficulty) &&
      communityInsight.meanDifficulty >= 1 &&
      communityInsight.meanDifficulty <= 5) {
    const score = communityInsight.meanDifficulty;
    return {
      score,
      level: score <= 2.3 ? "Ligera" : score <= 3.5 ? "Moderada" : "Exigente",
      source: "experiencia compartida",
      override: null,
      sampleCount: communityInsight.responseCount
    };
  }

  const metadata = course.advisorMetadata;
  let score: number;

  if (metadata?.complexity === "introductory") {
    score = 2.35;
  } else if (metadata?.complexity === "intermediate") {
    score = 3.15;
  } else if (metadata?.complexity === "advanced") {
    score = 4.05;
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

  // Credits are intentionally excluded from this score: they measure index weight,
  // not the student's personal experience or the difficulty of the subject.

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
  state: PlannerState,
  communityInsights: Record<string, AdvisorCommunityInsight> = {}
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
  const currentPeriod = plan.periods.find(
    (period) => period.id === state.meta.currentPeriod
  );
  const currentPeriodIndex = currentPeriod
    ? plan.periods.findIndex((period) => period.id === currentPeriod.id)
    : -1;
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

  const evaluated = candidates
    .filter((course) =>
      state.courseStates[course.code] !== "approved" &&
      state.courseStates[course.code] !== "inprogress"
    )
    .map((course) => {
      // A selected elective belongs to the period that contains its group,
      // even though it is stored in group.options rather than period.courses.
      const coursePeriod = periodForCourse(plan, course.code);
      const isLagged = Boolean(
        currentPeriod &&
        coursePeriod &&
        comparePeriodPositions(coursePeriod, currentPeriod) < 0
      );
      const blockers = blockersFor(course, state, allCourses, approved, plan.totalCredits);
      const directUnlocks = (dependents.get(course.code) || new Set<string>()).size;
      const unlocks = countDownstream(course.code, dependents);
      const profile = state.advisorCourseProfiles?.[course.code] || {};
      const curriculumId = plan.id || "";
      const communityInsight = curriculumId
        ? communityInsights[advisorInsightKey(curriculumId, course.code)]
        : undefined;
      const difficulty = estimateDifficulty(course, profile, communityInsight);
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
      if (profile.readiness === "some-gaps") {
        reasons.push("Has indicado que tienes algunas lagunas en los conocimientos previos");
      } else if (profile.readiness === "needs-review") {
        reasons.push("Has indicado que necesitas reforzar conocimientos antes de cursarla");
      }
      if (profile.experience === "challenging") {
        reasons.push("Según tu experiencia, esta asignatura te ha resultado especialmente exigente");
      } else if (profile.experience === "manageable") {
        reasons.push("Según tu experiencia, has podido manejar su carga");
      } else if (profile.experience === "as-expected") {
        reasons.push("Su dificultad coincidió con tus expectativas");
      }
      if (profile.challengeFactors?.length) {
        const factorLabels = profile.challengeFactors.map(
          (factor) => CHALLENGE_FACTOR_LABELS[factor]
        );
        reasons.push("Factores que identificaste: " + factorLabels.join(", "));
      }

      const recommendation: AdvisorRecommendation = {
        course,
        profile,
        unlocks,
        directUnlocks,
        blockers,
        canEnroll: blockers.length === 0,
        periodLabel: periodLabelForCourse(plan, course.code),
        difficulty,
        indexImpact: indexImpact(course.credits),
        fitsTarget,
        reasons,
        priorityScore
      };

      return { recommendation, isLagged };
    });

  // Only courses that can be taken now may enter the main recommendations.
  const ranked = evaluated
    .filter(({ recommendation }) => recommendation.canEnroll)
    .map(({ recommendation }) => recommendation)
    .sort((a, b) =>
      // Academic position is the primary criterion: earliest year and term first.
      // Priority score only decides the order among courses in the same period.
      compareCoursePeriods(plan, a.course.code, b.course.code) ||
      b.priorityScore - a.priorityScore ||
      a.difficulty.score - b.difficulty.score ||
      a.course.code.localeCompare(b.course.code)
    );

  const recommendations = ranked.slice(0, 5);
  const recommendedCodes = new Set(recommendations.map((item) => item.course.code));

  // Lagging is determined by the academic period, not by prerequisite availability.
  // Currently actionable subjects that unlock other courses appear first; blocked
  // subjects remain visible after them with the requirements that still need work.
  const laggedCourses = evaluated
    .filter(({ isLagged, recommendation }) =>
      isLagged && !recommendedCodes.has(recommendation.course.code)
    )
    .sort((a, b) => {
      // Among lagged subjects, show the period closest to the current one first.
      const periodOrder = compareCoursePeriods(
        plan,
        b.recommendation.course.code,
        a.recommendation.course.code
      );
      if (periodOrder !== 0) return periodOrder;

      // Within the same period, prioritize actionable courses that unlock others.
      return (
        Number(b.recommendation.canEnroll) - Number(a.recommendation.canEnroll) ||
        b.recommendation.directUnlocks - a.recommendation.directUnlocks ||
        b.recommendation.unlocks - a.recommendation.unlocks ||
        b.recommendation.priorityScore - a.recommendation.priorityScore ||
        a.recommendation.difficulty.score - b.recommendation.difficulty.score ||
        a.recommendation.course.code.localeCompare(b.recommendation.course.code)
      );
    })
    .slice(0, 5)
    .map(({ recommendation }) => recommendation);

  return {
    recommendations,
    laggedCourses,
    hasCurrentPeriod: currentPeriodIndex >= 0,
    targetCredits,
    activeCredits,
    remainingCredits,
    paceLabel
  };
}
