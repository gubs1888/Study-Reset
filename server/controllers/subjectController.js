import mongoose from "mongoose";
import Subject from "../models/Subject.js";

const colorPattern = /^#[0-9a-fA-F]{6}$/;
const allowedSubjectFields = new Set(["name", "description", "color"]);

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

const validateSubjectFields = (body, { requireName = false } = {}) => {
  const unknown = unexpectedFields(body, allowedSubjectFields);
  if (unknown.length) {
    return `Unexpected subject field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`;
  }

  if (requireName && body.name === undefined) {
    return "Subject name is required";
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return requireName ? "Subject name is required" : "Subject name cannot be empty";
    }
    if (body.name.trim().length > 80) {
      return "Subject name cannot exceed 80 characters";
    }
  }

  if (body.description !== undefined) {
    if (typeof body.description !== "string") {
      return "Subject description must be text";
    }
    if (body.description.trim().length > 300) {
      return "Subject description cannot exceed 300 characters";
    }
  }

  if (
    body.color !== undefined
    && (typeof body.color !== "string" || !colorPattern.test(body.color))
  ) {
    return "Subject color must be a valid hex color";
  }

  return null;
};

const handleSubjectError = (res, operation, error) => {
  console.error(`${operation} subject error:`, error.message);

  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res.status(400).json({ message: "Subject data is invalid" });
  }

  return res.status(500).json({ message: `Unable to ${operation} subject` });
};

export const createSubject = async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ message: "Request body must be a JSON object" });
    }

    const validationError = validateSubjectFields(req.body, { requireName: true });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const subject = await Subject.create({
      user: req.user._id,
      name: req.body.name.trim(),
      description: req.body.description?.trim() || "",
      color: req.body.color || "#062f72",
    });

    return res.status(201).json({
      message: "Subject created successfully",
      subject,
    });
  } catch (error) {
    return handleSubjectError(res, "create", error);
  }
};

export const getSubjects = async (req, res) => {
  try {
    const unknownQueryFields = Object.keys(req.query).filter(
      (field) => field !== "includeArchived"
    );
    if (unknownQueryFields.length) {
      return res.status(400).json({ message: "Unsupported subject filter" });
    }

    const includeArchived = req.query.includeArchived;
    if (
      includeArchived !== undefined
      && includeArchived !== "true"
      && includeArchived !== "false"
    ) {
      return res.status(400).json({
        message: "includeArchived must be true or false",
      });
    }

    const filter = { user: req.user._id };
    if (includeArchived !== "true") {
      filter.isArchived = false;
    }

    const subjects = await Subject.find(filter).sort({ createdAt: -1 });
    return res.json({ subjects });
  } catch (error) {
    return handleSubjectError(res, "retrieve", error);
  }
};

export const updateSubject = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid subject id" });
    }
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ message: "Request body must be a JSON object" });
    }
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "At least one subject field is required" });
    }

    const validationError = validateSubjectFields(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name.trim();
    if (req.body.description !== undefined) {
      updates.description = req.body.description.trim();
    }
    if (req.body.color !== undefined) updates.color = req.body.color;

    const subject = await Subject.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
        isArchived: false,
      },
      { $set: updates },
      { returnDocument: "after", runValidators: true }
    );

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    return res.json({
      message: "Subject updated successfully",
      subject,
    });
  } catch (error) {
    return handleSubjectError(res, "update", error);
  }
};

export const archiveSubject = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid subject id" });
    }

    const subject = await Subject.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
        isArchived: false,
      },
      { $set: { isArchived: true } },
      { returnDocument: "after", runValidators: true }
    );

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    return res.json({
      message: "Subject archived successfully",
      subject,
    });
  } catch (error) {
    return handleSubjectError(res, "archive", error);
  }
};

export const restoreSubject = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: "Invalid subject id" });
    }

    const subject = await Subject.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
        isArchived: true,
      },
      { $set: { isArchived: false } },
      { returnDocument: "after", runValidators: true }
    );

    if (!subject) {
      return res.status(404).json({ message: "Archived subject not found" });
    }

    return res.json({
      message: "Subject restored successfully",
      subject,
    });
  } catch (error) {
    return handleSubjectError(res, "restore", error);
  }
};
