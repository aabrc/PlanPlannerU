import { describe, expect, it } from "vitest";
import { buildAuthRedirectUrl, isValidEmailAddress } from "./auth";

describe("authentication helpers", () => {
  it("builds the local development redirect URL", () => {
    expect(buildAuthRedirectUrl("/", "http://localhost:5173"))
      .toBe("http://localhost:5173/");
  });

  it("preserves the GitHub Pages project path", () => {
    expect(buildAuthRedirectUrl("/PlanPlannerU/", "https://aabrc.github.io"))
      .toBe("https://aabrc.github.io/PlanPlannerU/");
  });

  it("normalizes a base path without a leading slash", () => {
    expect(buildAuthRedirectUrl("PlanPlannerU/", "https://aabrc.github.io"))
      .toBe("https://aabrc.github.io/PlanPlannerU/");
  });

  it("validates an email address without accepting whitespace", () => {
    expect(isValidEmailAddress("  student@example.com  ")).toBe(true);
    expect(isValidEmailAddress("not-an-email")).toBe(false);
    expect(isValidEmailAddress("student @example.com")).toBe(false);
    expect(isValidEmailAddress("student@")).toBe(false);
  });
});
