import mongoose from "mongoose";

const studySessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },

    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudyTask",
      default: null,
    },

    clientSessionId: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 128,
      match: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    },

    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      default: null,
    },

    plannedMinutes: {
      type: Number,
      default: 25,
      min: 1,
      max: 600,
      validate: {
        validator: Number.isInteger,
        message: "Planned minutes must be a whole number",
      },
    },

    // Retained for compatibility with any pre-focus-session prototype data.
    durationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    actualFocusedMinutes: {
      type: Number,
      default: 0,
      min: 0,
      max: 1440,
      validate: {
        validator: Number.isInteger,
        message: "Actual focused minutes must be a whole number",
      },
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
    },

    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

studySessionSchema.index({ user: 1, startedAt: -1 });
studySessionSchema.index({ user: 1, status: 1, startedAt: -1 });
studySessionSchema.index({ user: 1, task: 1, startedAt: -1 });
studySessionSchema.index(
  { user: 1, clientSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientSessionId: { $type: "string" } },
  }
);

export default mongoose.model("StudySession", studySessionSchema);
