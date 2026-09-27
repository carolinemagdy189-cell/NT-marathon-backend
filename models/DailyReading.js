const mongoose = require("mongoose");

const STATUSES = ["completed", "partial", "not_registered"];

const dailyReadingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    readingDayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReadingDay",
      default: null,
    },
    dayNumber: { type: Number, required: true, min: 1, max: 89, index: true },

    assignedChapters: { type: Number, required: true, min: 1 },
    chaptersRead: { type: Number, required: true, min: 1, max: 10 },

    status: {
      type: String,
      enum: { values: STATUSES, message: "Invalid status" },
      required: true,
      index: true,
    },

    reflection: { type: String, required: true, trim: true, maxlength: 2000 },
    savedAt: { type: Date, required: true }, // first submission time
    completedAt: { type: Date, default: null }, // when it first reached "completed"
  },
  { timestamps: true } // createdAt, updatedAt
);

// ONE record per user per marathon day - enforced by the database itself
dailyReadingSchema.index({ userId: 1, dayNumber: 1 }, { unique: true });

const DailyReading = mongoose.model("DailyReading", dailyReadingSchema);

module.exports = DailyReading;
module.exports.STATUSES = STATUSES;
