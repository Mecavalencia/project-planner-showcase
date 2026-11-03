import { describe, expect, it } from "vitest";
import { addBusinessHours, recommendedStartForDeadline } from "../src/utils/planning";

describe("planning utilities", () => {
  it("adds business hours across workdays", () => {
    const end = addBusinessHours(new Date("2026-06-05T12:00:00.000Z"), 8);
    expect(end.toISOString()).toBe("2026-06-08T12:00:00.000Z");
  });

  it("calculates a buffered start before deadline", () => {
    const start = recommendedStartForDeadline(new Date("2026-06-08T16:00:00.000Z"), 8, 2);
    expect(start.toISOString().startsWith("2026-06-03")).toBe(true);
  });
});
