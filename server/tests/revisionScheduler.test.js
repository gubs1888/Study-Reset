import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRevisionSchedule,
  REVISION_INTERVAL_DAYS,
} from "../services/revisionScheduler.js";

const reviewedAt = new Date("2026-08-09T12:00:00.000Z");

test("uses the explainable 1/3/7/14/30-day interval sequence", () => {
  assert.deepEqual(REVISION_INTERVAL_DAYS, [1, 3, 7, 14, 30]);
});

test("poor recall resets the sequence, shortens the interval, and lowers confidence", () => {
  const result = calculateRevisionSchedule({
    performance: "poor",
    revisionStep: 4,
    confidence: 3,
    reviewedAt,
  });

  assert.equal(result.revisionStep, 0);
  assert.equal(result.intervalDays, 1);
  assert.equal(result.confidence, 2);
  assert.equal(result.lastReviewedAt.toISOString(), "2026-08-09T12:00:00.000Z");
  assert.equal(result.nextReviewAt.toISOString(), "2026-08-10T12:00:00.000Z");
  assert.match(result.reason, /resets/i);
});

test("confidence never drops below one after poor recall", () => {
  const result = calculateRevisionSchedule({
    performance: "poor",
    revisionStep: 0,
    confidence: 1,
    reviewedAt,
  });

  assert.equal(result.confidence, 1);
});

test("fair recall holds the current interval and confidence", () => {
  const result = calculateRevisionSchedule({
    performance: "fair",
    revisionStep: 2,
    confidence: 3,
    reviewedAt,
  });

  assert.equal(result.revisionStep, 2);
  assert.equal(result.intervalDays, 7);
  assert.equal(result.confidence, 3);
  assert.equal(result.nextReviewAt.toISOString(), "2026-08-16T12:00:00.000Z");
  assert.match(result.reason, /repeats/i);
});

test("good recall advances one step and raises confidence", () => {
  const result = calculateRevisionSchedule({
    performance: "good",
    revisionStep: 1,
    confidence: 3,
    reviewedAt,
  });

  assert.equal(result.revisionStep, 2);
  assert.equal(result.intervalDays, 7);
  assert.equal(result.confidence, 4);
  assert.equal(result.nextReviewAt.toISOString(), "2026-08-16T12:00:00.000Z");
  assert.match(result.reason, /advances/i);
});

test("the first successful review advances from the initial 1-day due date to 3 days", () => {
  const result = calculateRevisionSchedule({
    performance: "good",
    revisionStep: 0,
    confidence: 3,
    reviewedAt,
  });

  assert.equal(result.revisionStep, 1);
  assert.equal(result.intervalDays, 3);
  assert.equal(result.nextReviewAt.toISOString(), "2026-08-12T12:00:00.000Z");
});

test("good recall caps the schedule at 30 days and confidence at five", () => {
  const result = calculateRevisionSchedule({
    performance: "good",
    revisionStep: 4,
    confidence: 5,
    reviewedAt,
  });

  assert.equal(result.revisionStep, 4);
  assert.equal(result.intervalDays, 30);
  assert.equal(result.confidence, 5);
  assert.equal(result.nextReviewAt.toISOString(), "2026-09-08T12:00:00.000Z");
  assert.match(result.reason, /maximum/i);
});

test("rejects unsupported inputs", () => {
  assert.throws(
    () => calculateRevisionSchedule({ performance: "excellent", reviewedAt }),
    /Performance/,
  );
  assert.throws(
    () => calculateRevisionSchedule({ performance: "good", revisionStep: 5, reviewedAt }),
    /Revision step/,
  );
  assert.throws(
    () => calculateRevisionSchedule({ performance: "good", confidence: 2.5, reviewedAt }),
    /Confidence/,
  );
  assert.throws(
    () => calculateRevisionSchedule({ performance: "good", reviewedAt: new Date("invalid") }),
    /Reviewed time/,
  );
  assert.throws(
    () => calculateRevisionSchedule({ performance: "good" }),
    /Reviewed time/,
  );
});
