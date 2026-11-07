import { describe, expect, it } from "vitest";
import planData from "./plan.json";
import type { CurriculumPlan } from "../types";

const plan = planData as CurriculumPlan;
const mandatoryCourses = plan.periods.flatMap((period) => period.courses);
const electiveCourses = plan.groups.flatMap((group) => group.options);
const allCourses = [...mandatoryCourses, ...electiveCourses];
const allCodes = new Set(allCourses.map((course) => course.code));
const groupById = new Map(plan.groups.map((group) => [group.id, group]));

describe("integridad del pensum ITT-2020", () => {
  it("conserva las cantidades y créditos generales del plan", () => {
    expect(plan.periods).toHaveLength(12);
    expect(mandatoryCourses).toHaveLength(69);
    expect(plan.groups).toHaveLength(14);
    expect(electiveCourses).toHaveLength(91);
    expect(plan.fixedCredits + plan.electiveMinimumCredits).toBe(plan.totalCredits);
    expect(plan.totalCredits).toBe(212);
  });

  it("mantiene los períodos en orden ascendente por año y período", () => {
    const positions = plan.periods.map((period) => [period.year, period.term]);
    const sorted = [...positions].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    expect(positions).toEqual(sorted);
    expect(new Set(plan.periods.map((period) => period.id)).size).toBe(plan.periods.length);
  });

  it("asigna cada grupo electivo a un único período existente", () => {
    const assignedIds = plan.periods.flatMap((period) => period.groups);

    expect(assignedIds.every((id) => groupById.has(id))).toBe(true);
    expect(new Set(assignedIds).size).toBe(plan.groups.length);
    expect(plan.groups.every((group) => assignedIds.filter((id) => id === group.id).length === 1)).toBe(true);
  });

  it("resuelve todos los prerrequisitos y requisitos adicionales", () => {
    const knownRequirements = new Set(plan.externalRequirements);
    const references = allCourses.flatMap((course) => [
      ...(course.req || []),
      ...(course.additional || [])
    ]);
    const unresolved = Array.from(new Set(references))
      .filter((code) => !allCodes.has(code) && !knownRequirements.has(code));

    expect(unresolved).toEqual([]);
  });

  it("cuadra los créditos de cada período con sus cursos y electivas mínimas", () => {
    for (const period of plan.periods) {
      const mandatoryCredits = period.courses.reduce((sum, course) => sum + course.credits, 0);
      const electiveCredits = period.groups.reduce(
        (sum, groupId) => sum + (groupById.get(groupId)?.minCredits || 0),
        0
      );

      expect(mandatoryCredits + electiveCredits).toBe(period.baseCredits);
    }
  });

  it("limita las opciones repetidas a grupos con incompatibilidad compartida", () => {
    const occurrences = new Map<string, string[]>();

    for (const group of plan.groups) {
      const localCodes = group.options.map((course) => course.code);
      expect(new Set(localCodes).size).toBe(localCodes.length);

      for (const course of group.options) {
        const groupIds = occurrences.get(course.code) || [];
        groupIds.push(group.id);
        occurrences.set(course.code, groupIds);
      }
    }

    for (const [code, groupIds] of occurrences) {
      if (groupIds.length < 2) continue;

      for (const groupId of groupIds) {
        const group = groupById.get(groupId);
        for (const otherGroupId of groupIds.filter((id) => id !== groupId)) {
          expect(group?.uniqueAcross, code + " debe impedir duplicidad entre grupos")
            .toContain(otherGroupId);
        }
      }
    }
  });
});
