import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
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

    examDate: {
      type: Date,
      required: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    importance: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    syllabusTopics: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Topic",
      }],
      default: [],
      validate: {
        validator: (topics) => topics.length <= 200,
        message: "An exam can contain at most 200 syllabus topics",
      },
    },

    isCompleted: {
      type: Boolean,
      default: false,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

examSchema.index({ user: 1, isCompleted: 1, examDate: 1 });
examSchema.index({ user: 1, subject: 1, examDate: 1 });

export default mongoose.model("Exam", examSchema);
