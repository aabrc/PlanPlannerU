export type CourseStatus = "pending" | "inprogress" | "approved";
export type CourseDifficultyOverride = "light" | "moderate" | "demanding";
export type AdvisorReadiness = "prepared" | "some-gaps" | "needs-review";
export type AdvisorCourseExperience = "not-started" | "manageable" | "as-expected" | "challenging";
export type AdvisorChallengeFactor =
  | "foundations"
  | "teaching-method"
  | "assessments"
  | "practical-skills"
  | "time-constraints";

export interface AdvisorCourseProfile {
  difficultyOverride?: CourseDifficultyOverride;
  readiness?: AdvisorReadiness;
  experience?: AdvisorCourseExperience;
  challengeFactors?: AdvisorChallengeFactor[];
}

/**
 * Aggregated, non-identifying student feedback for one course in one curriculum.
 * Raw student profiles must never be stored in this shared insight.
 */
export interface AdvisorCommunityInsight {
  curriculumId: string;
  courseCode: string;
  responseCount: number;
  meanDifficulty: number;
  updatedAt?: string;
}
export interface Course {
  id?: string;
  code: string;
  name: string;
  credits: number;
  req?: string[];
  additional?: string[];
  gate?: { percent: number; label?: string } | null;
  lab?: string;
  // General course facts only; never store a student's personal experience here.
  advisorMetadata?: {
    courseType?: "language" | "elective" | "professional-elective" | "lab" | "theory" | "technical" | "mixed";
    complexity?: "introductory" | "intermediate" | "advanced";
    area?: string;
  };
  [key: string]: unknown;
}
export interface ElectiveGroup {
  id: string;
  name: string;
  minCourses: number;
  minCredits: number;
  options: Course[];
  uniqueAcross?: string[];
  [key: string]: unknown;
}
export interface Period {
  id: string;
  year: number;
  term: number;
  label: string;
  courses: Course[];
  groups: string[];
  baseCredits: number;
}
export interface CurriculumPlan {
  id?: string;
  periods: Period[];
  groups: ElectiveGroup[];
  totalCredits: number;
  externalRequirements: string[];
  fixedCredits: number;
  electiveMinimumCredits: number;
}
export interface ScheduleEvent {
  id: string;
  courseCode?: string;
  title: string;
  kind?: string;
  days?: string[];
  start?: string;
  end?: string;
  location?: string;
  notes?: string;
  color?: string;
  [key: string]: unknown;
}
export interface GradeAttempt {
  id: string;
  courseCode: string;
  periodId: string;
  grade: number;
  createdAt: number;
}
export interface ScheduleViewRange {
  start: number;
  end: number;
  lastVisibleDay: number;
}

export interface PlannerState {
  courseStates: Record<string, CourseStatus>;
  selections: Record<string, string>;
  externalDone: Record<string, boolean>;
  scheduleEvents: ScheduleEvent[];
  scheduleView: ScheduleViewRange;
  gradeAttempts: GradeAttempt[];
  advisorCourseProfiles?: Record<string, AdvisorCourseProfile>;
  /** @deprecated Read only for migration; preferences are now stored in advisorCourseProfiles. */
  courseDifficultyOverrides?: Record<string, CourseDifficultyOverride>;
  meta: {
    currentPeriod: string;
    loadPerTerm: string;
    gpa: string;
    internship: number | string;
    [key: string]: unknown;
  };
  _syncUpdatedAt?: number;
  _syncRevision?: number;
  [key: string]: unknown;
}
