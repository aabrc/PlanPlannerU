import { describe, expect, it } from "vitest";
import {
  calculateAcademicIndex,
  letterForGrade,
  qualityPointsForGrade
} from "./academicIndex";
import type { Course, GradeAttempt, Period } from "../types";

const courses: Course[] = [
  { code: "MAT101", name: "Matemática", credits: 4 },
  { code: "ITT101", name: "Redes", credits: 2 },
  { code: "ORI100", name: "Orientación", credits: 0 }
];

const periods: Period[] = [
  { id: "y1p1", year: 1, term: 1, label: "Año 1 · Período 1", courses: [], groups: [], baseCredits: 0 },
  { id: "y1p2", year: 1, term: 2, label: "Año 1 · Período 2", courses: [], groups: [], baseCredits: 0 },
  { id: "y2p1", year: 2, term: 1, label: "Año 2 · Período 1", courses: [], groups: [], baseCredits: 0 }
];

const attempt = (
  courseCode: string,
  periodId: string,
  grade: number,
  createdAt: number
): GradeAttempt => ({
  id: courseCode + "-" + periodId + "-" + createdAt,
  courseCode,
  periodId,
  grade,
  createdAt
});

describe("academicIndex grading scale", () => {
  it("applies the expected boundaries for A, B, C, D and F", () => {
    expect([59, 60, 69, 70, 79, 80, 89, 90, 100].map(qualityPointsForGrade))
      .toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect([59, 60, 70, 80, 90].map(letterForGrade))
      .toEqual(["F", "D", "C", "B", "A"]);
  });
});

describe("calculateAcademicIndex", () => {
  it("calculates a credit-weighted period index and counts failing credits", () => {
    const result = calculateAcademicIndex([
      attempt("MAT101", "y1p1", 95, 1),
      attempt("ITT101", "y1p1", 59, 2),
      attempt("ORI100", "y1p1", 100, 3)
    ], courses, periods, "period", "y1p1");

    expect(result.totalCredits).toBe(6);
    expect(result.qualityPoints).toBe(16);
    expect(result.courseCount).toBe(2);
    expect(result.index).toBeCloseTo(16 / 6);
  });

  it("filters the period calculation to the selected term", () => {
    const result = calculateAcademicIndex([
      attempt("MAT101", "y1p1", 90, 1),
      attempt("ITT101", "y1p2", 80, 2)
    ], courses, periods, "period", "y1p2");

    expect(result.attempts.map((item) => item.courseCode)).toEqual(["ITT101"]);
    expect(result.totalCredits).toBe(2);
    expect(result.index).toBe(3);
  });

  it("uses the latest academic period rather than the latest timestamp for the cumulative index", () => {
    const result = calculateAcademicIndex([
      attempt("MAT101", "y1p1", 95, 5000),
      attempt("MAT101", "y1p2", 80, 10),
      attempt("ITT101", "y1p1", 70, 20)
    ], courses, periods, "cumulative");

    expect(result.attempts.find((item) => item.courseCode === "MAT101")?.grade).toBe(80);
    expect(result.totalCredits).toBe(6);
  });

  it("uses the newest timestamp when a course has multiple attempts in the same period", () => {
    const result = calculateAcademicIndex([
      attempt("MAT101", "y1p2", 70, 10),
      attempt("MAT101", "y1p2", 90, 20)
    ], courses, periods, "cumulative");

    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].grade).toBe(90);
    expect(result.index).toBe(4);
  });

  it("returns a null index when there are no graded credits", () => {
    const result = calculateAcademicIndex([
      attempt("ORI100", "y1p1", 100, 1)
    ], courses, periods, "period", "y1p1");

    expect(result.index).toBeNull();
    expect(result.totalCredits).toBe(0);
    expect(result.courseCount).toBe(0);
    expect(result.attempts).toEqual([]);
  });
});
