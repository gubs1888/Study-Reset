import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    preferences: {
      dailyTargetMinutes: {
        type: Number,
        default: 120,
      },
      focusDuration: {
        type: Number,
        default: 25,
      },
      breakDuration: {
        type: Number,
        default: 5,
      },
    },

    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },

    authTokenVersion: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },

    resetPasswordTokenHash: {
      type: String,
      default: null,
      select: false,
    },

    resetPasswordExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("User", userSchema);
