import type { Course, CurriculumPlan, PlannerState } from "../types";

export interface GraduationProjection {
  status: "needs-period" | "complete" | "projected";
  approvedCredits: number;
  remainingCredits: number;
  creditsPerTerm: number;
  periodsRemaining: number;
  finishYear: number | null;
  finishTerm: number | null;
  exceedsPlan: boolean;
}

function getApprovedCredits(plan: CurriculumPlan, state: PlannerState): number {
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

/**
 * Estimates the finishing academic period from the selected current period
 * and the student's expected credits per term. This is a mathematical
 * projection, not a guarantee of course availability or prerequisite clearance.
 */
export function calculateGraduationProjection(
  plan: CurriculumPlan,
  state: PlannerState
): GraduationProjection {
  const approvedCredits = getApprovedCredits(plan, state);
  const remainingCredits = Math.max(0, plan.totalCredits - approvedCredits);
  const rawTarget = Number(state.meta.loadPerTerm);
  const creditsPerTerm = Number.isFinite(rawTarget) && rawTarget > 0
    ? Math.min(30, Math.max(1, rawTarget))
    : 15;

  if (remainingCredits === 0) {
    return {
      status: "complete",
      approvedCredits,
      remainingCredits,
      creditsPerTerm,
      periodsRemaining: 0,
      finishYear: null,
      finishTerm: null,
      exceedsPlan: false
    };
  }

  const orderedPeriods = [...plan.periods].sort((a, b) =>
    a.year - b.year || a.term - b.term
  );
  const currentIndex = orderedPeriods.findIndex(
    (period) => period.id === state.meta.currentPeriod
  );

  if (currentIndex < 0 || orderedPeriods.length === 0) {
    return {
      status: "needs-period",
      approvedCredits,
      remainingCredits,
      creditsPerTerm,
      periodsRemaining: 0,
      finishYear: null,
      finishTerm: null,
      exceedsPlan: false
    };
  }

  const periodsRemaining = Math.ceil(remainingCredits / creditsPerTerm);
  const finishIndex = currentIndex + periodsRemaining - 1;
  const knownFinishPeriod = orderedPeriods[finishIndex];

  if (knownFinishPeriod) {
    return {
      status: "projected",
      approvedCredits,
      remainingCredits,
      creditsPerTerm,
      periodsRemaining,
      finishYear: knownFinishPeriod.year,
      finishTerm: knownFinishPeriod.term,
      exceedsPlan: false
    };
  }

  const lastPeriod = orderedPeriods[orderedPeriods.length - 1];
  const lastOrdinal = (lastPeriod.year - 1) * 3 + (lastPeriod.term - 1);
  const overflow = finishIndex - (orderedPeriods.length - 1);
  const finishOrdinal = lastOrdinal + overflow;

  return {
    status: "projected",
    approvedCredits,
    remainingCredits,
    creditsPerTerm,
    periodsRemaining,
    finishYear: Math.floor(finishOrdinal / 3) + 1,
    finishTerm: finishOrdinal % 3 + 1,
    exceedsPlan: true
  };
}
