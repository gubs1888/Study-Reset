import assert from "node:assert/strict";
import test from "node:test";
import { generateDailyPlan, shouldSuggestRecovery } from "../services/dailyPlanner.js";

const baseInput = {
  dateKey: "2026-08-09",
  availableMinutes: 180,
  tasks: [
    { _id: "task-high", title: "High priority", status: "pending", priority: "high", estimatedMinutes: 25 },
    { _id: "task-low", title: "Low priority without date", status: "pending", priority: "low", estimatedMinutes: 25 },
    { _id: "task-due", title: "Due soon", status: "pending", priority: "low", estimatedMinutes: 25, dueDate: "2026-08-10" },
    { _id: "task-overdue", title: "Overdue", status: "pending", priority: "low", estimatedMinutes: 25, dueDate: "2026-08-08" },
  ],
  exams: [
    { _id: "exam-1", name: "Physics final", examDate: "2026-08-12", importance: "high", isCompleted: false },
  ],
  dueTopics: [
    { _id: "topic-1", name: "Kinematics", confidence: 2, nextReviewAt: "2026-08-09", isArchived: false },
  ],
};

test("planner follows the documented deterministic priority order", () => {
  const plan = generateDailyPlan(baseInput);
  const focusTitles = plan.blocks.filter((block) => block.kind === "focus").map((block) => block.title);

  assert.deepEqual(focusTitles.slice(0, 6), [
    "Overdue",
    "Due soon",
    "High priority",
    "Prepare for Physics final",
    "Revise Kinematics",
    "Low priority without date",
  ]);
});

test("planner includes breaks without exceeding available minutes", () => {
  const plan = generateDailyPlan({ ...baseInput, availableMinutes: 60 });
  const total = plan.blocks.reduce((sum, block) => sum + block.durationMinutes, 0);

  assert.ok(plan.blocks.some((block) => block.kind === "break"));
  assert.equal(total, plan.scheduledMinutes);
  assert.ok(total <= 60);
});

test("Recovery Mode stays small, positive, and reversible", () => {
  const plan = generateDailyPlan({ ...baseInput, availableMinutes: 180, recoveryMode: true });
  const focusBlocks = plan.blocks.filter((block) => block.kind === "focus");

  assert.ok(focusBlocks.length <= 2);
  assert.ok(focusBlocks.every((block) => block.durationMinutes >= 10 && block.durationMinutes <= 15));
  assert.ok(plan.scheduledMinutes <= 35);
  assert.match(plan.explanation, /Normal Mode/);
  assert.doesNotMatch(plan.explanation, /failed|lazy|guilt|behind/i);
});

test("Recovery Mode suggestion uses low energy or repeated overdue work", () => {
  assert.equal(shouldSuggestRecovery({ energyLevel: 2, overdueTaskCount: 0 }), true);
  assert.equal(shouldSuggestRecovery({ energyLevel: 5, overdueTaskCount: 3 }), true);
  assert.equal(shouldSuggestRecovery({ energyLevel: 4, overdueTaskCount: 1 }), false);
});

test("planner output is stable for identical input", () => {
  assert.deepEqual(generateDailyPlan(baseInput), generateDailyPlan(baseInput));
});
