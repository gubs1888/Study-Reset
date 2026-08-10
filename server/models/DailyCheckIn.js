import mongoose from "mongoose";

const dailyCheckInSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    mood: {
      type: String,
      enum: ["very-low", "low", "neutral", "good", "great"],
      required: true,
    },
    energyLevel: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    availableMinutes: {
      type: Number,
      min: 10,
      max: 720,
      required: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    timezoneOffsetMinutes: {
      type: Number,
      min: -840,
      max: 840,
      default: 0,
    },
  },
  { timestamps: true }
);

dailyCheckInSchema.index({ user: 1, dateKey: 1 }, { unique: true });

export default mongoose.model("DailyCheckIn", dailyCheckInSchema);
