import { describe, expect, it } from "vitest";
import { calculateMilestoneProgress, calculateProjectHours, calculateTaskProgressFromSteps, canTransitionTask } from "../src";

describe("task status transitions", () => {
  it("allows manual start from planned", () => {
    expect(canTransitionTask("planned", "in_progress")).toBe(true);
  });

  it("does not allow reopening accepted tasks", () => {
    expect(canTransitionTask("accepted", "in_progress")).toBe(false);
  });
});

describe("project hours", () => {
  it("calculates projected deviation", () => {
    expect(calculateProjectHours({ budgetedHours: 40, estimatedHours: 18, actualHours: 30 })).toEqual({
      remainingHours: 10,
      projectedHours: 48,
      projectedDeviation: 8,
      usagePercent: 75
    });
  });
});

describe("task step progress", () => {
  it("weights step progress by configured contribution", () => {
    expect(calculateTaskProgressFromSteps({
      steps: [
        { progressPercent: 100, weightPercent: 40, estimatedHours: 4 },
        { progressPercent: 50, weightPercent: 40, estimatedHours: 6 },
        { progressPercent: 0, weightPercent: 20, estimatedHours: 2 }
      ]
    })).toEqual({ estimatedHours: 12, progressPercent: 60 });
  });
});

describe("milestone progress", () => {
  it("weights task progress by estimated hours", () => {
    expect(calculateMilestoneProgress({
      tasks: [
        { progressPercent: 100, estimatedHours: 2 },
        { progressPercent: 0, estimatedHours: 6 }
      ]
    }).progressPercent).toBe(25);
  });

  it("falls back to simple average when tasks have no estimated hours", () => {
    expect(calculateMilestoneProgress({
      tasks: [
        { progressPercent: 20, estimatedHours: 0 },
        { progressPercent: 80, estimatedHours: 0 }
      ]
    }).progressPercent).toBe(50);
  });

  it("calculates temporal progress from dates", () => {
    expect(calculateMilestoneProgress({
      tasks: [],
      plannedStartAt: "2026-01-01T00:00:00.000Z",
      plannedEndAt: "2026-01-11T00:00:00.000Z",
      now: "2026-01-06T00:00:00.000Z"
    }).timeProgressPercent).toBe(50);
  });
});
