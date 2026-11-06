export type CourseStatus = "pending" | "inprogress" | "approved";

export interface Course {
  id?: string;
  code: string;
  name: string;
  credits: number;
  req?: string[];
  additional?: string[];
  gate?: { percent: number; label?: string } | null;
  lab?: string;
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

export interface PlannerState {
  courseStates: Record<string, CourseStatus>;
  selections: Record<string, string>;
  externalDone: Record<string, boolean>;
  scheduleEvents: ScheduleEvent[];
  meta: {
    currentPeriod: string;
    loadPerTerm: string;
    gpa: string;
    internship: number | string;
    [key: string]: unknown;
  };
  _syncUpdatedAt?: number;
  [key: string]: unknown;
}
