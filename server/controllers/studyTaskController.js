import mongoose from "mongoose";
import StudyTask from "../models/StudyTask.js";
import Subject from "../models/Subject.js";

const allowedPriorities = new Set(["low", "medium", "high"]);
const allowedStatuses = new Set(["pending", "in-progress", "completed"]);
const createFields = new Set([
  "subject",
  "title",
  "description",
  "estimatedMinutes",
  "priority",
  "dueDate",
]);
const updateFields = new Set([...createFields, "status"]);
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

const unexpectedFields = (body, allowedFields) => (
  Object.keys(body).filter((field) => !allowedFields.has(field))
);

const isValidCalendarDate = (value) => {
  if (!dateOnlyPattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const parseDueDate = (value) => {
  if (value === null) return { value: null };
  if (typeof value !== "string" || value !== value.trim()) {
    return { error: "Due date must be an ISO date string or null" };
  }

  if (dateOnlyPattern.test(value)) {
    if (!isValidCalendarDate(value)) {
      return { error: "Due date is invalid" };
    }
    return { value: new Date(`${value}T00:00:00.000Z`) };
  }

  if (!dateTimePattern.test(value) || !isValidCalendarDate(value.slice(0, 10))) {
    return { error: "Due date must use ISO 8601 format" };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: "Due date is invalid" };
  }
  return { value: date };
};

const validateTaskFields = (body, { creating = false } = {}) => {
  const unknown = unexpectedFields(body, creating ? createFields : updateFields);
  if (unknown.length) {
    return {
      error: `Unexpected task field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
    };
  }

  if (creating && body.subject === undefined) {
    return { error: "A valid subject is required" };
  }
  if (body.subject !== undefined && !isValidId(body.subject)) {
    return { error: "A valid subject is required" };
  }

  if (creating && body.title === undefined) {
    return { error: "Task title is required" };
  }
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return { error: creating ? "Task title is required" : "Task title cannot be empty" };
    }
    if (body.title.trim().length > 120) {
      return { error: "Task title cannot exceed 120 characters" };
    }
  }

  if (body.description !== undefined) {
    if (typeof body.description !== "string") {
      return { error: "Task description must be text" };
    }
    if (body.description.trim().length > 500) {
      return { error: "Task description cannot exceed 500 characters" };
    }
  }

  if (
    body.estimatedMinutes !== undefined
    && (
      typeof body.estimatedMinutes !== "number"
      || !Number.isInteger(body.estimatedMinutes)
      || body.estimatedMinutes < 1
      || body.estimatedMinutes > 600
    )
  ) {
    return { error: "Estimated time must be a whole number between 1 and 600 minutes" };
  }

  if (body.priority !== undefined && !allowedPriorities.has(body.priority)) {
    return { error: "Priority must be low, medium, or high" };
  }

  if (body.status !== undefined && !allowedStatuses.has(body.status)) {
    return { error: "Task status is invalid" };
  }

  if (body.dueDate !== undefined) {
    const parsedDueDate = parseDueDate(body.dueDate);
    if (parsedDueDate.error) return parsedDueDate;
    return { dueDate: parsedDueDate.value };
  }

  return {};
};

const findOwnedActiveSubject = (subjectId, userId) => Subject.findOne({
  _id: subjectId,
  user: userId,
  isArchived: false,
});

const subjectPopulation = (userId) => ({
  path: "subject",
  select: "name color isArchived",
  match: { user: userId },
});

const populateTask = (task, userId) => task.populate(subjectPopulation(userId));

const handleTaskError = (res, operation, error) => {
  console.error(`${operation} study task error:`, error.message);

  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res.status(400).json({ message: "Study task data is invalid" });
  }

  return res.status(500).json({ message: `Unable to ${operation} study task` });
};

export const createStudyTask = async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ message: "Request body must be a JSON object" });
    }

    const validation = validateTaskFields(req.body, { creating: true });
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const existingSubject = await findOwnedActiveSubject(
      req.body.subject,
      req.user._id
    );
    if (!existingSubject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    const task = await StudyTask.create({
      user: req.user._id,
      subject: req.body.subject,
      title: req.body.title.trim(),
      description: req.body.description?.trim() || "",
      estimatedMinutes: req.body.estimatedMinutes ?? 25,
      priority: req.body.priority || "medium",
      dueDate: validation.dueDate ?? null,
    });

    await populateTask(task, req.user._id);
    return res.status(201).json({
      message: "Study task created successfully",
      task,
    });
  } catch (error) {
    return handleTaskError(res, "create", error);
  }
};

export const getStudyTasks = async (req, res) => {
  try {
    const tasks = await StudyTask.find({ user: req.user._id })
      .populate(subjectPopulation(req.user._id))
      .sort({ status: 1, createdAt: -1 });

    return res.json({ tasks });
  } catch (error) {
    return handleTaskError(res, "retrieve", error);
  }
};

export const updateStudyTask = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid task id" });
    }
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ message: "Request body must be a JSON object" });
    }
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "At least one task field is required" });
    }

    const validation = validateTaskFields(req.body);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const existingTask = await StudyTask.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).select("subject status completedAt");

    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    const updates = {};
    if (req.body.title !== undefined) updates.title = req.body.title.trim();
    if (req.body.description !== undefined) {
      updates.description = req.body.description.trim();
    }
    if (req.body.estimatedMinutes !== undefined) {
      updates.estimatedMinutes = req.body.estimatedMinutes;
    }
    if (req.body.priority !== undefined) updates.priority = req.body.priority;
    if (req.body.dueDate !== undefined) updates.dueDate = validation.dueDate;

    if (req.body.status !== undefined) {
      updates.status = req.body.status;
      if (req.body.status === "completed") {
        if (existingTask.status !== "completed" || !existingTask.completedAt) {
          updates.completedAt = new Date();
        }
      } else if (existingTask.completedAt) {
        updates.completedAt = null;
      }
    }

    if (req.body.subject !== undefined) {
      const keepsCurrentSubject = existingTask.subject.toString() === req.body.subject;
      if (!keepsCurrentSubject) {
        const existingSubject = await findOwnedActiveSubject(
          req.body.subject,
          req.user._id
        );
        if (!existingSubject) {
          return res.status(404).json({ message: "Subject not found" });
        }
      }
      updates.subject = req.body.subject;
    }

    const task = await StudyTask.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: updates },
      { returnDocument: "after", runValidators: true }
    ).populate(subjectPopulation(req.user._id));

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    return res.json({
      message: "Study task updated successfully",
      task,
    });
  } catch (error) {
    return handleTaskError(res, "update", error);
  }
};

export const deleteStudyTask = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid task id" });
    }

    const task = await StudyTask.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    return res.json({ message: "Study task deleted successfully" });
  } catch (error) {
    return handleTaskError(res, "delete", error);
  }
};
