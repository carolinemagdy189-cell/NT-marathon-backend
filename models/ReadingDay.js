const mongoose = require("mongoose");

/**
 * One document per marathon day (89 days total).
 * The data mirrors the deterministic schedule generated in
 * services/marathonService.js, which is the single source of truth.
 */
const readingDaySchema = new mongoose.Schema(
  {
    dayNumber: { type: Number, required: true, unique: true, min: 1, max: 89 },
    date: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    books: { type: [String], required: true },
    startChapter: { type: Number, required: true, min: 1 },
    endChapter: { type: Number, required: true, min: 1 },
    chapters: { type: Number, required: true, min: 1 }, // total chapters for the day
    title: { type: String, required: true }, // readable, e.g. "متى 10-12"
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

// (dayNumber and date already have unique indexes from the field definitions)

const ReadingDay = mongoose.model("ReadingDay", readingDaySchema);

module.exports = ReadingDay;
