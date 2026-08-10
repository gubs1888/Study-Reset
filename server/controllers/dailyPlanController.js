import mongoose from "mongoose";
import DailyCheckIn from "../models/DailyCheckIn.js";
import DailyPlan from "../models/DailyPlan.js";
import StudyTask from "../models/StudyTask.js";
import Exam from "../models/Exam.js";
import Topic from "../models/Topic.js";
import { generateDailyPlan, shouldSuggestRecovery } from "../services/dailyPlanner.js";
import { checkInValidation } from "./checkInController.js";

const { isValidDateKey } = checkInValidation;
const blockStatuses = new Set(["planned", "completed", "skipped"]);

const isPlainObject = (value) => (
  value !== null && typeof value === "object" && !Array.isArray(value)
);

const boundariesFor = (dateKey) => ({
  start: new Date(`${dateKey}T00:00:00.000Z`),
  end: new Date(`${dateKey}T23:59:59.999Z`),
});

const planDataFor = async (userId, dateKey) => {
  const { start, end } = boundariesFor(dateKey);
  const [tasks, exams, dueTopics, overdueTaskCount] = await Promise.all([
    StudyTask.find({ user: userId, status: { $ne: "completed" } }).lean(),
    Exam.find({ user: userId, isCompleted: false, examDate: { $gte: start } }).lean(),
    Topic.find({
      user: userId,
      isArchived: false,
      nextReviewAt: { $ne: null, $lte: end },
    }).lean(),
    StudyTask.countDocuments({
      user: userId,
      status: { $ne: "completed" },
      dueDate: { $ne: null, $lt: start },
    }),
  ]);

  return { tasks, exams, dueTopics, overdueTaskCount };
};

export const getDailyPlan = async (req, res) => {
  try {
    const { date } = req.query;
    if (!isValidDateKey(date)) {
      return res.status(400).json({ message: "Date must use YYYY-MM-DD" });
    }

    const [plan, checkIn, data] = await Promise.all([
      DailyPlan.findOne({ user: req.user._id, dateKey: date }),
      DailyCheckIn.findOne({ user: req.user._id, dateKey: date }),
      planDataFor(req.user._id, date),
    ]);

    const recoverySuggested = checkIn
      ? shouldSuggestRecovery({
        energyLevel: checkIn.energyLevel,
        overdueTaskCount: data.overdueTaskCount,
      })
      : data.overdueTaskCount >= 3;

    return res.json({ plan, checkIn, recoverySuggested });
  } catch (error) {
    console.error("Get daily plan error:", error.message);
    return res.status(500).json({ message: "Unable to retrieve the daily plan" });
  }
};

export const generatePlan = async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ message: "A JSON request body is required" });
    }

    const { date, recoveryMode = false } = req.body;
    if (!isValidDateKey(date)) {
      return res.status(400).json({ message: "Date must use YYYY-MM-DD" });
    }
    if (typeof recoveryMode !== "boolean") {
      return res.status(400).json({ message: "Recovery Mode must be true or false" });
    }

    const checkIn = await DailyCheckIn.findOne({ user: req.user._id, dateKey: date });
    if (!checkIn) {
      return res.status(409).json({ message: "Complete today’s check-in before generating a plan" });
    }

    const data = await planDataFor(req.user._id, date);
    const recoverySuggested = shouldSuggestRecovery({
      energyLevel: checkIn.energyLevel,
      overdueTaskCount: data.overdueTaskCount,
    });
    const generated = generateDailyPlan({
      dateKey: date,
      availableMinutes: checkIn.availableMinutes,
      recoveryMode,
      tasks: data.tasks,
      exams: data.exams,
      dueTopics: data.dueTopics,
    });

    const plan = await DailyPlan.findOneAndUpdate(
      { user: req.user._id, dateKey: date },
      {
        $set: {
          checkIn: checkIn._id,
          mode: recoveryMode ? "recovery" : "normal",
          recoverySuggested,
          availableMinutes: checkIn.availableMinutes,
          blocks: generated.blocks,
          explanation: generated.explanation,
          generatedAt: new Date(),
          manuallyAdjusted: false,
        },
        $setOnInsert: { user: req.user._id, dateKey: date },
      },
      { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ message: "Daily plan generated", plan });
  } catch (error) {
    console.error("Generate daily plan error:", error.message);
    return res.status(500).json({ message: "Unable to generate the daily plan" });
  }
};

const adjustedBlock = (input, existingById) => {
  if (!isPlainObject(input)) return { error: "Every plan block must be an object" };

  const identifier = input.id || input._id;
  const existing = identifier ? existingById.get(String(identifier)) : null;
  const durationMinutes = input.durationMinutes;
  const status = input.status ?? existing?.status ?? "planned";

  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 120) {
    return { error: "Every block duration must be an integer between 1 and 120 minutes" };
  }
  if (typeof status !== "string" || !blockStatuses.has(status)) {
    return { error: "Plan block status is invalid" };
  }

  if (existing) {
    const title = input.title ?? existing.title;
    if (typeof title !== "string" || !title.trim() || title.trim().length > 160) {
      return { error: "Plan block titles must contain at most 160 characters" };
    }
    return {
      block: {
        _id: existing._id,
        kind: existing.kind,
        sourceType: existing.sourceType,
        sourceId: existing.sourceId,
        title: title.trim(),
        durationMinutes,
        reason: existing.reason,
        status,
      },
    };
  }

  if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 160) {
    return { error: "A manual block title is required and must contain at most 160 characters" };
  }
  if (input.kind !== undefined && !["focus", "break"].includes(input.kind)) {
    return { error: "Manual block type is invalid" };
  }

  const kind = input.kind || "focus";
  return {
    block: {
      kind,
      sourceType: kind === "break" ? "break" : "manual",
      sourceId: null,
      title: input.title.trim(),
      durationMinutes,
      reason: kind === "break" ? "Manually added rest break." : "Manually added focus block.",
      status,
    },
  };
};

export const adjustDailyPlan = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid plan id" });
    }
    if (!isPlainObject(req.body) || !Array.isArray(req.body.blocks) || req.body.blocks.length > 50) {
      return res.status(400).json({ message: "Blocks must be an array containing at most 50 items" });
    }

    const plan = await DailyPlan.findOne({ _id: req.params.id, user: req.user._id });
    if (!plan) return res.status(404).json({ message: "Daily plan not found" });

    const existingById = new Map(plan.blocks.map((block) => [String(block._id), block]));
    const blocks = [];
    for (const input of req.body.blocks) {
      const result = adjustedBlock(input, existingById);
      if (result.error) return res.status(400).json({ message: result.error });
      blocks.push(result.block);
    }

    const totalMinutes = blocks.reduce((total, block) => total + block.durationMinutes, 0);
    if (totalMinutes > plan.availableMinutes) {
      return res.status(400).json({ message: "Adjusted plan cannot exceed available study time" });
    }

    if (plan.mode === "recovery") {
      const focusBlocks = blocks.filter((block) => block.kind === "focus");
      if (focusBlocks.length > 2 || focusBlocks.some((block) => block.durationMinutes > 15)) {
        return res.status(400).json({ message: "Recovery Mode allows at most two focus blocks of up to 15 minutes" });
      }
    }

    plan.blocks = blocks;
    plan.manuallyAdjusted = true;
    await plan.save();
    return res.json({ message: "Daily plan adjusted", plan });
  } catch (error) {
    console.error("Adjust daily plan error:", error.message);
    return res.status(500).json({ message: "Unable to adjust the daily plan" });
  }
};
