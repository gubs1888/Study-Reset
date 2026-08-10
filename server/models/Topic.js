import mongoose from "mongoose";

const topicSchema = new mongoose.Schema(
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

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    confidence: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
      validate: {
        validator: Number.isInteger,
        message: "Confidence must be an integer",
      },
    },

    lastReviewedAt: {
      type: Date,
      default: null,
    },

    nextReviewAt: {
      type: Date,
      default: null,
    },

    revisionStep: {
      type: Number,
      default: 0,
      min: 0,
      max: 4,
      validate: {
        validator: Number.isInteger,
        message: "Revision step must be an integer",
      },
    },

    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

topicSchema.index({ user: 1, subject: 1, isArchived: 1, createdAt: -1 });
topicSchema.index({ user: 1, isArchived: 1, nextReviewAt: 1 });

export default mongoose.model("Topic", topicSchema);
