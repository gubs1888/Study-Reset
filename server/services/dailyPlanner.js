const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const dateKeyFrom = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const objectIdString = (value) => {
  if (!value) return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
};

const taskCandidate = (task, dateKey) => {
  const dueKey = dateKeyFrom(task.dueDate);
  const isOverdue = Boolean(dueKey && dueKey < dateKey);
  let group = 6;

  if (isOverdue) group = 0;
  else if (dueKey) group = 1;
  else if (task.priority === "high") group = 2;
  else group = 6;

  let reason = "This keeps an incomplete task moving forward.";
  if (isOverdue) reason = `This task was due ${dueKey} and is still incomplete.`;
  else if (dueKey) reason = `This task has a nearer due date (${dueKey}).`;
  else if (task.priority === "high") reason = "This task is marked high priority.";

  return {
    sourceType: "task",
    sourceId: objectIdString(task._id),
    title: task.title,
    requestedMinutes: Math.max(10, Number(task.estimatedMinutes) || 25),
    reason,
    sortKey: [group, dueKey || "9999-12-31", PRIORITY_ORDER[task.priority] ?? 1, String(task.createdAt || "")],
  };
};

const examCandidate = (exam, dateKey) => {
  const examKey = dateKeyFrom(exam.examDate);
  const daysAway = examKey
    ? Math.max(0, Math.ceil((Date.parse(`${examKey}T00:00:00.000Z`) - Date.parse(`${dateKey}T00:00:00.000Z`)) / 86_400_000))
    : null;

  return {
    sourceType: "exam",
    sourceId: objectIdString(exam._id),
    title: `Prepare for ${exam.name}`,
    requestedMinutes: exam.importance === "high" ? 50 : 25,
    reason: daysAway === null
      ? "This upcoming exam needs preparation."
      : `This ${exam.importance || "medium"}-importance exam is ${daysAway === 0 ? "today" : `${daysAway} day${daysAway === 1 ? "" : "s"} away`}.`,
    sortKey: [4, examKey || "9999-12-31", PRIORITY_ORDER[exam.importance] ?? 1, exam.name],
  };
};

const topicCandidate = (topic) => ({
  sourceType: "topic",
  sourceId: objectIdString(topic._id),
  title: `Revise ${topic.name}`,
  requestedMinutes: topic.confidence <= 2 ? 25 : 15,
  reason: `This revision is due${topic.confidence ? ` and confidence is ${topic.confidence}/5` : ""}.`,
  sortKey: [5, dateKeyFrom(topic.nextReviewAt) || "0000-00-00", topic.confidence ?? 3, topic.name],
});

const compareCandidates = (left, right) => {
  for (let index = 0; index < left.sortKey.length; index += 1) {
    const comparison = String(left.sortKey[index]).localeCompare(String(right.sortKey[index]), "en", { numeric: true });
    if (comparison) return comparison;
  }
  return left.title.localeCompare(right.title);
};

export const shouldSuggestRecovery = ({ energyLevel, overdueTaskCount }) => (
  Number(energyLevel) <= 2 || Number(overdueTaskCount) >= 3
);

export const generateDailyPlan = ({
  dateKey,
  availableMinutes,
  recoveryMode = false,
  tasks = [],
  exams = [],
  dueTopics = [],
}) => {
  const budget = Number(availableMinutes);
  if (!Number.isInteger(budget) || budget < 10 || budget > 720) {
    throw new TypeError("availableMinutes must be an integer between 10 and 720");
  }
  if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new TypeError("dateKey must use YYYY-MM-DD");
  }

  const candidates = [
    ...tasks.filter((task) => task.status !== "completed").map((task) => taskCandidate(task, dateKey)),
    ...exams.filter((exam) => !exam.isCompleted).map((exam) => examCandidate(exam, dateKey)),
    ...dueTopics.filter((topic) => !topic.isArchived).map(topicCandidate),
  ].sort(compareCandidates);

  const blocks = [];
  const remainingByCandidate = new Map(candidates.map((candidate) => [candidate, candidate.requestedMinutes]));
  const focusBlockMinutes = recoveryMode ? 15 : 25;
  const minimumFocusMinutes = 10;
  const breakMinutes = 5;
  const maximumWorkBlocks = recoveryMode ? 2 : Math.ceil(budget / minimumFocusMinutes);
  let remainingBudget = recoveryMode ? Math.min(budget, 35) : budget;
  let workBlockCount = 0;
  let madeProgress = true;

  while (remainingBudget >= minimumFocusMinutes && workBlockCount < maximumWorkBlocks && madeProgress) {
    madeProgress = false;

    for (const candidate of candidates) {
      if (remainingBudget < minimumFocusMinutes || workBlockCount >= maximumWorkBlocks) break;

      const candidateRemaining = remainingByCandidate.get(candidate) || 0;
      if (candidateRemaining <= 0) continue;

      const needsBreak = workBlockCount > 0;
      const breakCost = needsBreak ? breakMinutes : 0;
      const availableForFocus = remainingBudget - breakCost;
      if (availableForFocus < minimumFocusMinutes) continue;

      const focusMinutes = Math.min(focusBlockMinutes, candidateRemaining, availableForFocus);
      if (focusMinutes < minimumFocusMinutes) {
        remainingByCandidate.set(candidate, 0);
        continue;
      }

      if (needsBreak) {
        blocks.push({
          kind: "break",
          sourceType: "break",
          sourceId: null,
          title: "Short break",
          durationMinutes: breakMinutes,
          reason: "A brief pause helps the next focus block stay realistic.",
          status: "planned",
        });
        remainingBudget -= breakMinutes;
      }

      blocks.push({
        kind: "focus",
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        title: candidate.title,
        durationMinutes: focusMinutes,
        reason: candidate.reason,
        status: "planned",
      });
      remainingBudget -= focusMinutes;
      remainingByCandidate.set(candidate, candidateRemaining - focusMinutes);
      workBlockCount += 1;
      madeProgress = true;

      if (recoveryMode && workBlockCount >= maximumWorkBlocks) break;
    }
  }

  const scheduledMinutes = blocks.reduce((total, block) => total + block.durationMinutes, 0);
  const explanation = recoveryMode
    ? "Recovery Mode keeps today deliberately small with at most two short, high-value focus blocks. Regenerate in Normal Mode whenever your capacity returns."
    : blocks.length
      ? "This plan uses overdue work first, then nearer due dates, priority, upcoming exams, and due revisions. Focus blocks and breaks stay within the time you made available."
      : "There is no overdue, scheduled, exam, or revision work to place today. You can add a manual block or regenerate after adding work.";

  return { blocks, scheduledMinutes, explanation };
};

export const plannerInternals = { dateKeyFrom, compareCandidates };
