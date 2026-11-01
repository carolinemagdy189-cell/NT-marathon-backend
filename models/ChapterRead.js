const mongoose = require("mongoose");

/**
 * One document per (user, NEW Testament chapter) the user has read.
 * Source of chapter-level truth for book progress and overall journey
 * progress. The unique index guarantees the same chapter is never counted
 * twice for the same user, no matter how submissions overlap.
 */
const chapterReadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    book: { type: String, required: true }, // e.g. "لوقا" (canonical Arabic name)
    chapter: { type: Number, required: true, min: 1 }, // chapter number within the book
    dayNumber: { type: Number, required: true, min: 1, max: 89 }, // marathon day submitted on
    readAt: { type: Date, required: true }, // submission instant
  },
  { timestamps: true, versionKey: false }
);

// THE deduplication guarantee: one chapter of one book per user, ever.
chapterReadSchema.index({ userId: 1, book: 1, chapter: 1 }, { unique: true });

const ChapterRead = mongoose.model("ChapterRead", chapterReadSchema);

module.exports = ChapterRead;
