import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import Subject from "../models/Subject.js";
import Topic from "../models/Topic.js";

const EXAM_NAME_MAX_LENGTH = 120;
const EXAM_DESCRIPTION_MAX_LENGTH = 1000;
const MAX_SYLLABUS_TOPICS = 200;
const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const importanceValues = new Set(["low", "medium", "high"]);
const examFields = new Set([
  "subject",
  "name",
  "examDate",
  "description",
  "importance",
  "syllabusTopics",
  "isCompleted",
]);

const isBodyObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const invalidField = (body) => Object.keys(body).find((field) => !examFields.has(field));

const isObjectId = (value) => typeof value === "string"
  && objectIdPattern.test(value)
  && mongoose.isValidObjectId(value);

const parseExamDate = (value) => {
  if (typeof value !== "string" || !dateOnlyPattern.test(value)) {
    return { error: "examDate must use YYYY-MM-DD" };
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) {
    return { error: "examDate must contain a valid calendar date" };
  }

  return { value: date };
};

const validateName = (name) => {
  if (typeof name !== "string" || !name.trim()) return "Exam name is required";
  if (name.trim().length > EXAM_NAME_MAX_LENGTH) {
    return `Exam name cannot exceed ${EXAM_NAME_MAX_LENGTH} characters`;
  }
  return null;
};

const validateDescription = (description) => {
  if (typeof description !== "string") return "Exam description must be text";
  if (description.trim().length > EXAM_DESCRIPTION_MAX_LENGTH) {
    return `Exam description cannot exceed ${EXAM_DESCRIPTION_MAX_LENGTH} characters`;
  }
  return null;
};

const validateTopicIds = (topicIds) => {
  if (!Array.isArray(topicIds)) return "syllabusTopics must be an array";
  if (topicIds.length > MAX_SYLLABUS_TOPICS) {
    return `syllabusTopics cannot contain more than ${MAX_SYLLABUS_TOPICS} items`;
  }
  if (topicIds.some((topicId) => !isObjectId(topicId))) {
    return "Every syllabus topic must be a valid topic id";
  }
  if (new Set(topicIds).size !== topicIds.length) {
    return "syllabusTopics cannot contain duplicate topic ids";
  }
  return null;
};

const findOwnedActiveSubject = (subjectId, userId) => Subject.findOne({
  _id: subjectId,
  user: userId,
  isArchived: false,
}).select("_id");

const syllabusTopicsExist = async (topicIds, subjectId, userId) => {
  if (topicIds.length === 0) return true;

  const count = await Topic.countDocuments({
    _id: { $in: topicIds },
    user: userId,
    subject: subjectId,
  });

  return count === topicIds.length;
};

const populateExam = (exam, userId) => exam.populate([
  {
    path: "subject",
    select: "name color isArchived",
    match: { user: userId, isArchived: false },
  },
  {
    path: "syllabusTopics",
    select: "name confidence nextReviewAt isArchived subject",
    match: { user: userId },
  },
]);

const sendFailure = (res, operation, error, publicMessage) => {
  console.error(`${operation}:`, error.message);

  if (error?.name === "ValidationError") {
    return res.status(400).json({ message: "Exam data is invalid" });
  }

  return res.status(500).json({ message: publicMessage });
};

export const getExams = async (req, res) => {
  try {
    const exams = await Exam.find({ user: req.user._id })
      .populate([
        {
          path: "subject",
          select: "name color isArchived",
          match: { user: req.user._id, isArchived: false },
        },
        {
          path: "syllabusTopics",
          select: "name confidence nextReviewAt isArchived subject",
          match: { user: req.user._id },
        },
      ])
      .sort({ isCompleted: 1, examDate: 1, createdAt: -1 });

    return res.json({ exams: exams.filter((exam) => exam.subject) });
  } catch (error) {
    return sendFailure(res, "Get exams error", error, "Unable to retrieve exams");
  }
};

export const createExam = async (req, res) => {
  try {
    if (!isBodyObject(req.body)) {
      return res.status(400).json({ message: "Request body must be a JSON object" });
    }

    const unsupportedField = invalidField(req.body);
    if (unsupportedField) {
      return res.status(400).json({ message: `Unsupported exam field: ${unsupportedField}` });
    }

    const {
      subject,
      name,
      examDate,
      description,
      importance,
      syllabusTopics,
      isCompleted,
    } = req.body;

    if (!isObjectId(subject)) {
      return res.status(400).json({ message: "A valid subject is required" });
    }

    const nameError = validateName(name);
    if (nameError) return res.status(400).json({ message: nameError });

    const parsedDate = parseExamDate(examDate);
    if (parsedDate.error) return res.status(400).json({ message: parsedDate.error });

    if (description !== undefined) {
      const descriptionError = validateDescription(description);
      if (descriptionError) return res.status(400).json({ message: descriptionError });
    }

    const normalizedImportance = importance === undefined ? "medium" : importance;
    if (typeof normalizedImportance !== "string" || !importanceValues.has(normalizedImportance)) {
      return res.status(400).json({ message: "Importance must be low, medium, or high" });
    }

    const normalizedTopics = syllabusTopics === undefined ? [] : syllabusTopics;
    const topicsError = validateTopicIds(normalizedTopics);
    if (topicsError) return res.status(400).json({ message: topicsError });

    const normalizedCompleted = isCompleted === undefined ? false : isCompleted;
    if (typeof normalizedCompleted !== "boolean") {
      return res.status(400).json({ message: "isCompleted must be a boolean" });
    }

    const ownedSubject = await findOwnedActiveSubject(subject, req.user._id);
    if (!ownedSubject) return res.status(404).json({ message: "Subject not found" });

    const topicsExist = await syllabusTopicsExist(normalizedTopics, subject, req.user._id);
    if (!topicsExist) {
      return res.status(404).json({
        message: "Every syllabus topic must be an owned topic in this subject",
      });
    }

    const exam = await Exam.create({
      user: req.user._id,
      subject,
      name: name.trim(),
      examDate: parsedDate.value,
      description: description === undefined ? "" : description.trim(),
      importance: normalizedImportance,
      syllabusTopics: normalizedTopics,
      isCompleted: normalizedCompleted,
      completedAt: normalizedCompleted ? new Date() : null,
    });

    await populateExam(exam, req.user._id);
    return res.status(201).json({ message: "Exam created successfully", exam });
  } catch (error) {
    return sendFailure(res, "Create exam error", error, "Unable to create exam");
  }
};

export const updateExam = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid exam id" });
    }
    if (!isBodyObject(req.body)) {
      return res.status(400).json({ message: "Request body must be a JSON object" });
    }
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "At least one exam field is required" });
    }

    const unsupportedField = invalidField(req.body);
    if (unsupportedField) {
      return res.status(400).json({ message: `Unsupported exam field: ${unsupportedField}` });
    }

    const exam = await Exam.findOne({ _id: req.params.id, user: req.user._id });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const {
      subject,
      name,
      examDate,
      description,
      importance,
      syllabusTopics,
      isCompleted,
    } = req.body;

    if (subject !== undefined && !isObjectId(subject)) {
      return res.status(400).json({ message: "A valid subject is required" });
    }
    if (name !== undefined) {
      const nameError = validateName(name);
      if (nameError) return res.status(400).json({ message: nameError });
    }

    let parsedDate;
    if (examDate !== undefined) {
      parsedDate = parseExamDate(examDate);
      if (parsedDate.error) return res.status(400).json({ message: parsedDate.error });
    }

    if (description !== undefined) {
      const descriptionError = validateDescription(description);
      if (descriptionError) return res.status(400).json({ message: descriptionError });
    }
    if (importance !== undefined
      && (typeof importance !== "string" || !importanceValues.has(importance))) {
      return res.status(400).json({ message: "Importance must be low, medium, or high" });
    }
    if (syllabusTopics !== undefined) {
      const topicsError = validateTopicIds(syllabusTopics);
      if (topicsError) return res.status(400).json({ message: topicsError });
    }
    if (isCompleted !== undefined && typeof isCompleted !== "boolean") {
      return res.status(400).json({ message: "isCompleted must be a boolean" });
    }

    const effectiveSubject = subject === undefined ? exam.subject.toString() : subject;
    const effectiveTopics = syllabusTopics === undefined
      ? exam.syllabusTopics.map((topicId) => topicId.toString())
      : syllabusTopics;

    const ownedSubject = await findOwnedActiveSubject(effectiveSubject, req.user._id);
    if (!ownedSubject) return res.status(404).json({ message: "Subject not found" });

    const topicsExist = await syllabusTopicsExist(
      effectiveTopics,
      effectiveSubject,
      req.user._id,
    );
    if (!topicsExist) {
      return res.status(404).json({
        message: "Every syllabus topic must be an owned topic in this subject",
      });
    }

    const updates = {};
    if (subject !== undefined) updates.subject = subject;
    if (name !== undefined) updates.name = name.trim();
    if (examDate !== undefined) updates.examDate = parsedDate.value;
    if (description !== undefined) updates.description = description.trim();
    if (importance !== undefined) updates.importance = importance;
    if (syllabusTopics !== undefined) updates.syllabusTopics = syllabusTopics;
    if (isCompleted !== undefined) {
      if (isCompleted && !exam.isCompleted) updates.completedAt = new Date();
      if (!isCompleted) updates.completedAt = null;
      updates.isCompleted = isCompleted;
    }

    const updatedExam = await Exam.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updates,
      { returnDocument: "after", runValidators: true },
    );
    if (!updatedExam) return res.status(404).json({ message: "Exam not found" });

    await populateExam(updatedExam, req.user._id);
    return res.json({ message: "Exam updated successfully", exam: updatedExam });
  } catch (error) {
    return sendFailure(res, "Update exam error", error, "Unable to update exam");
  }
};

export const deleteExam = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid exam id" });
    }

    const exam = await Exam.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!exam) return res.status(404).json({ message: "Exam not found" });
    return res.json({ message: "Exam deleted successfully" });
  } catch (error) {
    return sendFailure(res, "Delete exam error", error, "Unable to delete exam");
  }
};
