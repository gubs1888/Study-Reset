import mongoose from "mongoose";

const planBlockSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["focus", "break"],
      required: true,
    },
    sourceType: {
      type: String,
      enum: ["task", "exam", "topic", "manual", "break"],
      required: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 120,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    status: {
      type: String,
      enum: ["planned", "completed", "skipped"],
      default: "planned",
    },
  },
  { _id: true }
);

const dailyPlanSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    checkIn: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DailyCheckIn",
      required: true,
    },
    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    mode: {
      type: String,
      enum: ["normal", "recovery"],
      default: "normal",
    },
    recoverySuggested: {
      type: Boolean,
      default: false,
    },
    availableMinutes: {
      type: Number,
      required: true,
      min: 10,
      max: 720,
    },
    blocks: {
      type: [planBlockSchema],
      default: [],
    },
    explanation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 600,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    manuallyAdjusted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

dailyPlanSchema.index({ user: 1, dateKey: 1 }, { unique: true });

export default mongoose.model("DailyPlan", dailyPlanSchema);
