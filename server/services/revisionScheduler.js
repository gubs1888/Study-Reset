export const REVISION_INTERVAL_DAYS = Object.freeze([1, 3, 7, 14, 30]);

const performances = new Set(["poor", "fair", "good"]);

const assertInputs = ({ performance, revisionStep, confidence, reviewedAt }) => {
  if (!performances.has(performance)) {
    throw new TypeError("Performance must be poor, fair, or good");
  }

  if (!Number.isInteger(revisionStep) || revisionStep < 0 || revisionStep >= REVISION_INTERVAL_DAYS.length) {
    throw new RangeError("Revision step is outside the supported interval sequence");
  }

  if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) {
    throw new RangeError("Confidence must be an integer between 1 and 5");
  }

  if (!(reviewedAt instanceof Date) || Number.isNaN(reviewedAt.getTime())) {
    throw new TypeError("Reviewed time must be a valid Date");
  }
};

/**
 * Calculate the next deterministic spaced-revision state.
 *
 * A new topic starts at step 0 and is first due after one day. Poor recall
 * resets it to that step, fair recall repeats the current interval, and good
 * recall advances one step through the capped 1/3/7/14/30-day sequence.
 */
export const calculateRevisionSchedule = ({
  performance,
  revisionStep = 0,
  confidence = 3,
  reviewedAt,
}) => {
  assertInputs({ performance, revisionStep, confidence, reviewedAt });

  let nextStep = revisionStep;
  let nextConfidence = confidence;
  let reason;

  if (performance === "poor") {
    nextStep = 0;
    nextConfidence = Math.max(1, confidence - 1);
    reason = "Poor recall resets the sequence so the topic is reviewed again after 1 day.";
  } else if (performance === "fair") {
    reason = `Fair recall repeats the current ${REVISION_INTERVAL_DAYS[nextStep]}-day interval for reinforcement.`;
  } else {
    nextStep = Math.min(revisionStep + 1, REVISION_INTERVAL_DAYS.length - 1);
    nextConfidence = Math.min(5, confidence + 1);
    reason = nextStep === revisionStep
      ? "Good recall keeps the topic at the maximum 30-day interval."
      : `Good recall advances the topic to the ${REVISION_INTERVAL_DAYS[nextStep]}-day interval.`;
  }

  const intervalDays = REVISION_INTERVAL_DAYS[nextStep];
  const lastReviewedAt = new Date(reviewedAt.getTime());
  const nextReviewAt = new Date(reviewedAt.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    performance,
    revisionStep: nextStep,
    confidence: nextConfidence,
    intervalDays,
    lastReviewedAt,
    nextReviewAt,
    reason,
  };
};
