/**
 * Marathon service: generates the official 89-day reading schedule from
 * config/marathonData.js and keeps the ReadingDay collection in sync with it.
 *
 * Distribution rule (exactly 260 chapters over 89 days):
 *   82 days x 3 chapters + 7 days x 2 chapters = 260
 * The 7 two-chapter days are spread as evenly as possible using the
 * deterministic "carry" positions of the fraction 260/89, so every user sees
 * exactly the same schedule and the last day ends at الرؤيا 22.
 */

const ReadingDay = require("../models/ReadingDay");
const { MARATHON, BIBLE_BOOKS, TOTAL_CHAPTERS } = require("../config/marathonData");
const { dateKeyForDayNumber, getEffectiveDateKey } = require("../utils/marathonDate");
const { ApiError } = require("../utils/apiError");

/** Generate the full 89-day schedule (pure function, no DB access). */
const buildSchedule = () => {
  const schedule = [];

  // Two-chapter days: 7 of them, spread evenly across 89 days.
  // Day d is a 2-chapter day when floor(d*7/89) > floor((d-1)*7/89).
  const twoChapterDays = new Set();
  for (let d = 1; d <= MARATHON.totalDays; d += 1) {
    if (
      Math.floor((d * 7) / MARATHON.totalDays) >
      Math.floor(((d - 1) * 7) / MARATHON.totalDays)
    ) {
      twoChapterDays.add(d);
    }
  }

  // Walk the New Testament chapter by chapter in canonical order.
  let bookIndex = 0;
  let nextChapter = 1;

  for (let dayNumber = 1; dayNumber <= MARATHON.totalDays; dayNumber += 1) {
    const totalChapters = twoChapterDays.has(dayNumber) ? 2 : 3;

    // Per-book spans for today: [{ book, start, end }, ...]
    const spans = [];

    for (let taken = 0; taken < totalChapters; ) {
      const [book, chaptersInBook] = BIBLE_BOOKS[bookIndex];
      const take = Math.min(totalChapters - taken, chaptersInBook - nextChapter + 1);

      const lastSpan = spans[spans.length - 1];
      if (lastSpan && lastSpan.book === book) {
        lastSpan.end = nextChapter + take - 1; // extend current book's span
      } else {
        spans.push({ book, start: nextChapter, end: nextChapter + take - 1 });
      }

      nextChapter += take;
      taken += take;

      if (nextChapter > chaptersInBook) {
        bookIndex += 1;
        nextChapter = 1;
      }
    }

    schedule.push({
      dayNumber,
      date: dateKeyForDayNumber(dayNumber),
      books: spans.map((s) => s.book),
      startChapter: spans[0].start,
      endChapter: spans[spans.length - 1].end,
      chapters: totalChapters,
      title: buildTitle(spans),
      spans, // per-book chapter spans (used for per-book progress)
      isActive: true,
    });
  }

  return schedule;
};

/** Readable title: "متى 10-12" or cross-book "متى 28 - مرقس 1-2". */
const buildTitle = (spans) =>
  spans.map((s) => `${s.book} ${s.start}-${s.end}`).join(" - ");

/** In-memory schedule lookup by dayNumber (1..89). Returns null if invalid. */
const getScheduleByDayNumber = (dayNumber) => {
  const schedule = buildSchedule();
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > MARATHON.totalDays) {
    return null;
  }
  return schedule[dayNumber - 1];
};

/** Load today's ReadingDay document from MongoDB (null outside the window). */
const getTodayReadingDay = async () => {
  const dateKey = getEffectiveDateKey();
  return ReadingDay.findOne({ date: dateKey });
};

/** Load a ReadingDay by dayNumber; 404 ApiError when invalid. */
const getReadingDayByNumber = async (dayNumber) => {
  const n = Number(dayNumber);
  if (!Number.isInteger(n) || n < 1 || n > MARATHON.totalDays) {
    throw new ApiError(404, "Reading day not found");
  }
  return ReadingDay.findOne({ dayNumber: n });
};

/**
 * Sync the generated schedule into MongoDB (upsert by dayNumber).
 * Idempotent: safe to run any number of times.
 * @returns {{created:number, updated:number, total:number, chapters:number, startDate, endDate}}
 */
const syncScheduleToDatabase = async () => {
  const schedule = buildSchedule();
  let created = 0;
  let updated = 0;

  for (const day of schedule) {
    const result = await ReadingDay.updateOne(
      { dayNumber: day.dayNumber },
      { $set: day },
      { upsert: true }
    );
    if (result.upsertedCount > 0) created += 1;
    else if (result.modifiedCount > 0) updated += 1;
  }

  return {
    created,
    updated,
    total: schedule.length,
    chapters: schedule.reduce((sum, d) => sum + d.chapters, 0),
    startDate: MARATHON.startDate,
    endDate: MARATHON.endDate,
  };
};

module.exports = {
  buildSchedule,
  buildTitle,
  getScheduleByDayNumber,
  getTodayReadingDay,
  getReadingDayByNumber,
  syncScheduleToDatabase,
  TOTAL_CHAPTERS,
  MARATHON,
};
