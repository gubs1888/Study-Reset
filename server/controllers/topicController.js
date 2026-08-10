import mongoose from "mongoose";
import Subject from "../models/Subject.js";
import Topic from "../models/Topic.js";
import {
  calculateRevisionSchedule,
  REVISION_INTERVAL_DAYS,
} from "../services/revisionScheduler.js";

const TOPIC_NAME_MAX_LENGTH = 120;
const TOPIC_DESCRIPTION_MAX_LENGTH = 1000;
const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const reviewPerformances = new Set(["poor", "fair", "good"]);
const createFields = new Set([
  "subject",
  "name",
  "description",
  "confidence",
  "lastReviewedAt",
  "nextReviewAt",
  "revisionStep",
]);
const updateFields = new Set([...createFields, "isArchived"]);

const isBodyObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const invalidField = (body, allowedFields) => Object.keys(body)
  .find((field) => !allowedFields.has(field));

const isObjectId = (value) => typeof value === "string"
  && objectIdPattern.test(value)
  && mongoose.isValidObjectId(value);

const isValidCalendarDate = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const parseDateInput = (value, fieldName) => {
  if (value === null) return { value: null };

  if (typeof value !== "string") {
    return { error: `${fieldName} must be a date string or null` };
  }

  if (dateOnlyPattern.test(value)) {
    if (!isValidCalendarDate(value)) {
      return { error: `${fieldName} must contain a valid calendar date` };
    }

    return { value: new Date(`${value}T00:00:00.000Z`) };
  }

  if (!dateTimePattern.test(value)) {
    return { error: `${fieldName} must use YYYY-MM-DD or an ISO 8601 timestamp with a timezone` };
  }

  const datePortion = value.slice(0, 10);
  const parsed = new Date(value);
  if (!isValidCalendarDate(datePortion) || Number.isNaN(parsed.getTime())) {
    return { error: `${fieldName} must contain a valid date` };
  }

  return { value: parsed };
};

const validateName = (name) => {
  if (typeof name !== "string" || !name.trim()) {
    return "Topic name is required";
  }

  if (name.trim().length > TOPIC_NAME_MAX_LENGTH) {
    return `Topic name cannot exceed ${TOPIC_NAME_MAX_LENGTH} characters`;
  }

  return null;
};

const validateDescription = (description) => {
  if (typeof description !== "string") return "Topic description must be text";
  if (description.trim().length > TOPIC_DESCRIPTION_MAX_LENGTH) {
    return `Topic description cannot exceed ${TOPIC_DESCRIPTION_MAX_LENGTH} characters`;
  }
  return null;
};

const validateConfidence = (confidence) => Number.isInteger(confidence)
  && confidence >= 1
  && confidence <= 5;

const validateRevisionStep = (revisionStep) => Number.isInteger(revisionStep)
  && revisionStep >= 0
  && revisionStep < REVISION_INTERVAL_DAYS.length;

const findOwnedActiveSubject = (subjectId, userId) => Subject.findOne({
  _id: subjectId,
  user: userId,
  isArchived: false,
}).select("_id");

const populateTopic = (topic, userId) => topic.populate({
  path: "subject",
  select: "name color isArchived",
  match: { user: userId, isArchived: false },
});

const datesAreOrdered = (lastReviewedAt, nextReviewAt) => !lastReviewedAt
  || !nextReviewAt
  || nextReviewAt.getTime() > lastReviewedAt.getTime();

const sendFailure = (res, operation, error, publicMessage) => {
  console.error(`${operation}:`, error.message);

  if (error?.name === "ValidationError") {
    return res.status(400).json({ message: "Topic data is invalid" });
  }

  return res.status(500).json({ message: publicMessage });
};

export const getTopics = async (req, res) => {
  try {
    const { includeArchived } = req.query;
    if (includeArchived !== undefined && includeArchived !== "true" && includeArchived !== "false") {
      return res.status(400).json({ message: "includeArchived must be true or false" });
    }

    const query = { user: req.user._id };
    if (includeArchived !== "true") query.isArchived = false;

    const topics = await Topic.find(query)
      .populate({
        path: "subject",
        select: "name color isArchived",
        match: { user: req.user._id, isArchived: false },
      })
      .sort({ nextReviewAt: 1, createdAt: -1 });

    return res.json({ topics: topics.filter((topic) => topic.subject) });
  } catch (error) {
    return sendFailure(res, "Get topics error", error, "Unable to retrieve topics");
  }
};

export const createTopic = async (req, res) => {
  try {
    if (!isBodyObject(req.body)) {
      return res.status(400).json({ message: "Request body must be a JSON object" });
    }

    const unsupportedField = invalidField(req.body, createFields);
    if (unsupportedField) {
      return res.status(400).json({ message: `Unsupported topic field: ${unsupportedField}` });
    }

    const {
      subject,
      name,
      description,
      confidence,
      lastReviewedAt,
      nextReviewAt,
      revisionStep,
    } = req.body;

    if (!isObjectId(subject)) {
      return res.status(400).json({ message: "A valid subject is required" });
    }

    const nameError = validateName(name);
    if (nameError) return res.status(400).json({ message: nameError });

    if (description !== undefined) {
      const descriptionError = validateDescription(description);
      if (descriptionError) return res.status(400).json({ message: descriptionError });
    }

    const normalizedConfidence = confidence === undefined ? 3 : confidence;
    if (!validateConfidence(normalizedConfidence)) {
      return res.status(400).json({ message: "Confidence must be an integer between 1 and 5" });
    }

    const normalizedRevisionStep = revisionStep === undefined ? 0 : revisionStep;
    if (!validateRevisionStep(normalizedRevisionStep)) {
      return res.status(400).json({ message: "Revision step must be an integer between 0 and 4" });
    }

    const parsedLastReview = lastReviewedAt === undefined
      ? { value: null }
      : parseDateInput(lastReviewedAt, "lastReviewedAt");
    if (parsedLastReview.error) {
      return res.status(400).json({ message: parsedLastReview.error });
    }

    let parsedNextReview;
    if (nextReviewAt === undefined) {
      const scheduleStart = parsedLastReview.value || new Date();
      parsedNextReview = {
        value: new Date(
          scheduleStart.getTime()
          + REVISION_INTERVAL_DAYS[normalizedRevisionStep] * 24 * 60 * 60 * 1000,
        ),
      };
    } else {
      parsedNextReview = parseDateInput(nextReviewAt, "nextReviewAt");
    }
    if (parsedNextReview.error) {
      return res.status(400).json({ message: parsedNextReview.error });
    }

    if (!datesAreOrdered(parsedLastReview.value, parsedNextReview.value)) {
      return res.status(400).json({ message: "nextReviewAt must be later than lastReviewedAt" });
    }

    const ownedSubject = await findOwnedActiveSubject(subject, req.user._id);
    if (!ownedSubject) return res.status(404).json({ message: "Subject not found" });

    const topic = await Topic.create({
      user: req.user._id,
      subject,
      name: name.trim(),
      description: description === undefined ? "" : description.trim(),
      confidence: normalizedConfidence,
      lastReviewedAt: parsedLastReview.value,
      nextReviewAt: parsedNextReview.value,
      revisionStep: normalizedRevisionStep,
    });

    await populateTopic(topic, req.user._id);
    return res.status(201).json({ message: "Topic created successfully", topic });
  } catch (error) {
    return sendFailure(res, "Create topic error", error, "Unable to create topic");
  }
};

export const updateTopic = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid topic id" });
    }
    if (!isBodyObject(req.body)) {
      return res.status(400).json({ message: "Request body must be a JSON object" });
    }
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "At least one topic field is required" });
    }

    const unsupportedField = invalidField(req.body, updateFields);
    if (unsupportedField) {
      return res.status(400).json({ message: `Unsupported topic field: ${unsupportedField}` });
    }

    const topic = await Topic.findOne({ _id: req.params.id, user: req.user._id });
    if (!topic) return res.status(404).json({ message: "Topic not found" });

    const {
      subject,
      name,
      description,
      confidence,
      lastReviewedAt,
      nextReviewAt,
      revisionStep,
      isArchived,
    } = req.body;

    if (subject !== undefined && !isObjectId(subject)) {
      return res.status(400).json({ message: "A valid subject is required" });
    }
    if (name !== undefined) {
      const nameError = validateName(name);
      if (nameError) return res.status(400).json({ message: nameError });
    }
    if (description !== undefined) {
      const descriptionError = validateDescription(description);
      if (descriptionError) return res.status(400).json({ message: descriptionError });
    }
    if (confidence !== undefined && !validateConfidence(confidence)) {
      return res.status(400).json({ message: "Confidence must be an integer between 1 and 5" });
    }
    if (revisionStep !== undefined && !validateRevisionStep(revisionStep)) {
      return res.status(400).json({ message: "Revision step must be an integer between 0 and 4" });
    }
    if (isArchived !== undefined && typeof isArchived !== "boolean") {
      return res.status(400).json({ message: "isArchived must be a boolean" });
    }

    const parsedLastReview = lastReviewedAt === undefined
      ? { value: topic.lastReviewedAt }
      : parseDateInput(lastReviewedAt, "lastReviewedAt");
    if (parsedLastReview.error) {
      return res.status(400).json({ message: parsedLastReview.error });
    }
    const parsedNextReview = nextReviewAt === undefined
      ? { value: topic.nextReviewAt }
      : parseDateInput(nextReviewAt, "nextReviewAt");
    if (parsedNextReview.error) {
      return res.status(400).json({ message: parsedNextReview.error });
    }
    if (!datesAreOrdered(parsedLastReview.value, parsedNextReview.value)) {
      return res.status(400).json({ message: "nextReviewAt must be later than lastReviewedAt" });
    }

    const effectiveSubject = subject === undefined ? topic.subject.toString() : subject;
    const ownedSubject = await findOwnedActiveSubject(effectiveSubject, req.user._id);
    if (!ownedSubject) return res.status(404).json({ message: "Subject not found" });

    const updates = {};
    if (subject !== undefined) updates.subject = subject;
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (confidence !== undefined) updates.confidence = confidence;
    if (lastReviewedAt !== undefined) updates.lastReviewedAt = parsedLastReview.value;
    if (nextReviewAt !== undefined) updates.nextReviewAt = parsedNextReview.value;
    if (revisionStep !== undefined) updates.revisionStep = revisionStep;
    if (isArchived !== undefined) updates.isArchived = isArchived;

    const updatedTopic = await Topic.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updates,
      { returnDocument: "after", runValidators: true },
    );
    if (!updatedTopic) return res.status(404).json({ message: "Topic not found" });

    await populateTopic(updatedTopic, req.user._id);
    return res.json({ message: "Topic updated successfully", topic: updatedTopic });
  } catch (error) {
    return sendFailure(res, "Update topic error", error, "Unable to update topic");
  }
};

export const archiveTopic = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid topic id" });
    }

    const topic = await Topic.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, isArchived: false },
      { isArchived: true },
      { returnDocument: "after", runValidators: true },
    );

    if (!topic) return res.status(404).json({ message: "Topic not found" });
    await populateTopic(topic, req.user._id);
    return res.json({ message: "Topic archived successfully", topic });
  } catch (error) {
    return sendFailure(res, "Archive topic error", error, "Unable to archive topic");
  }
};

export const reviewTopic = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid topic id" });
    }
    if (!isBodyObject(req.body)) {
      return res.status(400).json({ message: "Request body must be a JSON object" });
    }

    const unsupportedField = invalidField(req.body, new Set(["performance"]));
    if (unsupportedField) {
      return res.status(400).json({ message: `Unsupported review field: ${unsupportedField}` });
    }
    if (!reviewPerformances.has(req.body.performance)) {
      return res.status(400).json({ message: "Performance must be poor, fair, or good" });
    }

    const topic = await Topic.findOne({
      _id: req.params.id,
      user: req.user._id,
      isArchived: false,
    });
    if (!topic) return res.status(404).json({ message: "Topic not found" });

    const ownedSubject = await findOwnedActiveSubject(topic.subject.toString(), req.user._id);
    if (!ownedSubject) return res.status(404).json({ message: "Subject not found" });

    const revision = calculateRevisionSchedule({
      performance: req.body.performance,
      revisionStep: topic.revisionStep,
      confidence: topic.confidence,
      reviewedAt: new Date(),
    });

    const updatedTopic = await Topic.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, isArchived: false },
      {
        confidence: revision.confidence,
        revisionStep: revision.revisionStep,
        lastReviewedAt: revision.lastReviewedAt,
        nextReviewAt: revision.nextReviewAt,
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!updatedTopic) return res.status(404).json({ message: "Topic not found" });

    await populateTopic(updatedTopic, req.user._id);

    return res.json({
      message: "Topic review recorded successfully",
      topic: updatedTopic,
      revision: {
        performance: revision.performance,
        intervalDays: revision.intervalDays,
        reason: revision.reason,
      },
    });
  } catch (error) {
    return sendFailure(res, "Review topic error", error, "Unable to record topic review");
  }
};
