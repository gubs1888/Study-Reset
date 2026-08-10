import mongoose from "mongoose";
import StudySession from "../models/StudySession.js";
import StudyTask from "../models/StudyTask.js";
import Subject from "../models/Subject.js";

const createFields = new Set([
  "subject",
  "task",
  "clientSessionId",
  "plannedMinutes",
  "startedAt",
]);
const completeFields = new Set([
  "actualFocusedMinutes",
  "endedAt",
  "markTaskCompleted",
]);
const cancelFields = new Set(["actualFocusedMinutes", "endedAt"]);
const listFilters = new Set(["from", "to", "limit"]);
const clientSessionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const dateTimePattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/;

const isPlainObject = (value) => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
);

const isValidId = (value) => (
  typeof value === "string" && mongoose.isObjectIdOrHexString(value)
);

const unexpectedFields = (value, allowedFields) => (
  Object.keys(value).filter((field) => !allowedFields.has(field))
);

const isValidCalendarDate = (value) => {
  if (!dateOnlyPattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const parseTimestamp = (
  value,
  { allowDateOnly = false, endOfDay = false } = {}
) => {
  if (typeof value !== "string" || value !== value.trim()) return null;

  if (allowDateOnly && dateOnlyPattern.test(value)) {
    if (!isValidCalendarDate(value)) return null;
    return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  }

  if (!dateTimePattern.test(value) || !isValidCalendarDate(value.slice(0, 10))) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const validateWholeMinutes = (value, { min, max, field }) => {
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < min
    || value > max
  ) {
    return `${field} must be a whole number between ${min} and ${max}`;
  }
  return null;
};

const sessionPopulation = (userId) => [
  {
    path: "subject",
    select: "name color isArchived",
    match: { user: userId },
  },
  {
    path: "task",
    select: "subject title status completedAt",
    match: { user: userId },
  },
];

const populateSession = (session, userId) => (
  session.populate(sessionPopulation(userId))
);

const handleFocusSessionError = (res, operation, error) => {
  console.error(`${operation} focus session error:`, error.message);

  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res.status(400).json({ message: "Focus session data is invalid" });
  }

  return res.status(500).json({ message: `Unable to ${operation} focus session` });
};

const validateCreateBody = (body) => {
  const unknown = unexpectedFields(body, createFields);
  if (unknown.length) {
    return `Unexpected focus session field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`;
  }
  if (!isValidId(body.subject)) {
    return "A valid subject is required";
  }
  if (body.task !== undefined && body.task !== null && !isValidId(body.task)) {
    return "Task must be a valid id or null";
  }
  if (
    typeof body.clientSessionId !== "string"
    || !clientSessionIdPattern.test(body.clientSessionId)
  ) {
    return "clientSessionId must contain 8 to 128 safe characters";
  }
  if (body.plannedMinutes !== undefined) {
    const minutesError = validateWholeMinutes(body.plannedMinutes, {
      min: 1,
      max: 600,
      field: "Planned minutes",
    });
    if (minutesError) return minutesError;
  }
  if (body.startedAt !== undefined && !parseTimestamp(body.startedAt)) {
    return "startedAt must be a valid ISO 8601 timestamp";
  }
  return null;
};

const validateCompletionBody = (body) => {
  const unknown = unexpectedFields(body, completeFields);
  if (unknown.length) {
    return `Unexpected completion field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`;
  }
  if (body.actualFocusedMinutes === undefined) {
    return "actualFocusedMinutes is required";
  }
  const minutesError = validateWholeMinutes(body.actualFocusedMinutes, {
    min: 0,
    max: 1440,
    field: "Actual focused minutes",
  });
  if (minutesError) return minutesError;
  if (body.endedAt !== undefined && !parseTimestamp(body.endedAt)) {
    return "endedAt must be a valid ISO 8601 timestamp";
  }
  if (
    body.markTaskCompleted !== undefined
    && typeof body.markTaskCompleted !== "boolean"
  ) {
    return "markTaskCompleted must be true or false";
  }
  return null;
};

const validateCancellationBody = (body) => {
  const unknown = unexpectedFields(body, cancelFields);
  if (unknown.length) {
    return `Unexpected cancellation field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`;
  }
  if (body.actualFocusedMinutes !== undefined) {
    const minutesError = validateWholeMinutes(body.actualFocusedMinutes, {
      min: 0,
      max: 1440,
      field: "Actual focused minutes",
    });
    if (minutesError) return minutesError;
  }
  if (body.endedAt !== undefined && !parseTimestamp(body.endedAt)) {
    return "endedAt must be a valid ISO 8601 timestamp";
  }
  return null;
};

const markLinkedTaskCompleted = async (session, userId) => {
  if (!session.task) return false;

  const task = await StudyTask.findOne({
    _id: session.task,
    user: userId,
    subject: session.subject,
  }).select("status completedAt");

  if (!task) return false;
  if (task.status === "completed" && task.completedAt) return true;

  const updates = {
    status: "completed",
    completedAt: new Date(),
  };

  const updatedTask = await StudyTask.findOneAndUpdate(
    {
      _id: task._id,
      user: userId,
      subject: session.subject,
    },
    { $set: updates },
    { returnDocument: "after", runValidators: true }
  );

  return Boolean(updatedTask);
};

export const getFocusSessions = async (req, res) => {
  try {
    const unknown = unexpectedFields(req.query, listFilters);
    if (unknown.length) {
      return res.status(400).json({ message: "Unsupported focus session filter" });
    }

    let from;
    if (req.query.from !== undefined) {
      from = parseTimestamp(req.query.from, { allowDateOnly: true });
      if (!from) {
        return res.status(400).json({ message: "from must be a valid ISO date or timestamp" });
      }
    }

    let to;
    if (req.query.to !== undefined) {
      to = parseTimestamp(req.query.to, {
        allowDateOnly: true,
        endOfDay: dateOnlyPattern.test(req.query.to),
      });
      if (!to) {
        return res.status(400).json({ message: "to must be a valid ISO date or timestamp" });
      }
    }

    if (from && to && from > to) {
      return res.status(400).json({ message: "from cannot be after to" });
    }

    let limit = 50;
    if (req.query.limit !== undefined) {
      if (
        typeof req.query.limit !== "string"
        || !/^[1-9]\d{0,2}$/.test(req.query.limit)
      ) {
        return res.status(400).json({ message: "limit must be a whole number between 1 and 100" });
      }
      limit = Number(req.query.limit);
      if (limit > 100) {
        return res.status(400).json({ message: "limit must be a whole number between 1 and 100" });
      }
    }

    const filter = { user: req.user._id };
    if (from || to) {
      filter.startedAt = {};
      if (from) filter.startedAt.$gte = from;
      if (to) filter.startedAt.$lte = to;
    }

    const sessions = await StudySession.find(filter)
      .sort({ startedAt: -1 })
      .limit(limit)
      .populate(sessionPopulation(req.user._id));

    return res.json({ sessions });
  } catch (error) {
    return handleFocusSessionError(res, "retrieve", error);
  }
};

export const createFocusSession = async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ message: "Request body must be a JSON object" });
    }

    const validationError = validateCreateBody(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const existingSession = await StudySession.findOne({
      user: req.user._id,
      clientSessionId: req.body.clientSessionId,
    });
    if (existingSession) {
      await populateSession(existingSession, req.user._id);
      return res.json({
        message: "Focus session already exists",
        created: false,
        session: existingSession,
      });
    }

    const subject = await Subject.findOne({
      _id: req.body.subject,
      user: req.user._id,
    }).select("_id");
    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    const taskId = req.body.task ?? null;
    if (taskId) {
      const task = await StudyTask.findOne({
        _id: taskId,
        user: req.user._id,
        subject: subject._id,
      }).select("_id");
      if (!task) {
        return res.status(404).json({
          message: "Task not found for this subject",
        });
      }
    }

    const session = await StudySession.create({
      user: req.user._id,
      subject: subject._id,
      task: taskId,
      clientSessionId: req.body.clientSessionId,
      plannedMinutes: req.body.plannedMinutes ?? 25,
      startedAt: req.body.startedAt
        ? parseTimestamp(req.body.startedAt)
        : new Date(),
      status: "active",
    });

    await populateSession(session, req.user._id);
    return res.status(201).json({
      message: "Focus session started",
      created: true,
      session,
    });
  } catch (error) {
    if (error?.code === 11000 && isPlainObject(req.body)) {
      const existingSession = await StudySession.findOne({
        user: req.user._id,
        clientSessionId: req.body.clientSessionId,
      });
      if (existingSession) {
        await populateSession(existingSession, req.user._id);
        return res.json({
          message: "Focus session already exists",
          created: false,
          session: existingSession,
        });
      }
    }
    return handleFocusSessionError(res, "create", error);
  }
};

export const completeFocusSession = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid focus session id" });
    }
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ message: "Request body must be a JSON object" });
    }

    const validationError = validateCompletionBody(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    let session = await StudySession.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!session) {
      return res.status(404).json({ message: "Focus session not found" });
    }
    if (session.status === "cancelled") {
      return res.status(409).json({ message: "A cancelled focus session cannot be completed" });
    }
    if (req.body.markTaskCompleted === true && !session.task) {
      return res.status(400).json({ message: "Focus session is not linked to a task" });
    }

    let alreadyCompleted = session.status === "completed";
    if (!alreadyCompleted) {
      const endedAt = req.body.endedAt
        ? parseTimestamp(req.body.endedAt)
        : new Date();
      if (endedAt < session.startedAt) {
        return res.status(400).json({ message: "endedAt cannot be before startedAt" });
      }

      const completedSession = await StudySession.findOneAndUpdate(
        {
          _id: req.params.id,
          user: req.user._id,
          status: "active",
        },
        {
          $set: {
            status: "completed",
            endedAt,
            actualFocusedMinutes: req.body.actualFocusedMinutes,
          },
        },
        { returnDocument: "after", runValidators: true }
      );

      if (completedSession) {
        session = completedSession;
      } else {
        session = await StudySession.findOne({
          _id: req.params.id,
          user: req.user._id,
        });
        if (!session) {
          return res.status(404).json({ message: "Focus session not found" });
        }
        if (session.status === "cancelled") {
          return res.status(409).json({ message: "A cancelled focus session cannot be completed" });
        }
        if (session.status !== "completed") {
          return res.status(409).json({ message: "Focus session state changed; please retry" });
        }
        alreadyCompleted = true;
      }
    }

    const taskMarkedCompleted = req.body.markTaskCompleted === true
      ? await markLinkedTaskCompleted(session, req.user._id)
      : false;

    await populateSession(session, req.user._id);
    return res.json({
      message: alreadyCompleted
        ? "Focus session was already completed"
        : "Focus session completed",
      alreadyCompleted,
      taskMarkedCompleted,
      session,
    });
  } catch (error) {
    return handleFocusSessionError(res, "complete", error);
  }
};

export const cancelFocusSession = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid focus session id" });
    }

    const body = req.body === undefined ? {} : req.body;
    if (!isPlainObject(body)) {
      return res.status(400).json({ message: "Request body must be a JSON object" });
    }
    const validationError = validateCancellationBody(body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    let session = await StudySession.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!session) {
      return res.status(404).json({ message: "Focus session not found" });
    }
    if (session.status === "completed") {
      return res.status(409).json({ message: "A completed focus session cannot be cancelled" });
    }
    if (session.status === "cancelled") {
      await populateSession(session, req.user._id);
      return res.json({
        message: "Focus session was already cancelled",
        alreadyCancelled: true,
        session,
      });
    }

    const endedAt = body.endedAt ? parseTimestamp(body.endedAt) : new Date();
    if (endedAt < session.startedAt) {
      return res.status(400).json({ message: "endedAt cannot be before startedAt" });
    }

    const updates = { status: "cancelled", endedAt };
    if (body.actualFocusedMinutes !== undefined) {
      updates.actualFocusedMinutes = body.actualFocusedMinutes;
    }

    const cancelledSession = await StudySession.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
        status: "active",
      },
      { $set: updates },
      { returnDocument: "after", runValidators: true }
    );

    if (cancelledSession) {
      session = cancelledSession;
    } else {
      session = await StudySession.findOne({
        _id: req.params.id,
        user: req.user._id,
      });
      if (!session) {
        return res.status(404).json({ message: "Focus session not found" });
      }
      if (session.status === "completed") {
        return res.status(409).json({ message: "A completed focus session cannot be cancelled" });
      }
      if (session.status !== "cancelled") {
        return res.status(409).json({ message: "Focus session state changed; please retry" });
      }
    }

    await populateSession(session, req.user._id);
    return res.json({
      message: "Focus session cancelled",
      alreadyCancelled: false,
      session,
    });
  } catch (error) {
    return handleFocusSessionError(res, "cancel", error);
  }
};
