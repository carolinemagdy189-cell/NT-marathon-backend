const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiError");
const marathonDate = require("../utils/marathonDate");
const {
  calculateUserProgress,
  calculateBookProgress,
} = require("../services/progressService");
const { buildSchedule } = require("../services/marathonService");

/**
 * GET /api/progress
 * Overall journey progress for the current user (same numbers everywhere).
 */
const getProgress = asyncHandler(async (req, res) => {
  const progress = await calculateUserProgress(req.user._id);
  sendSuccess(res, 200, progress);
});

/**
 * GET /api/progress/books
 * Per-book New Testament progress (e.g. متى 12/28 = 42.86%).
 */
const getBookProgress = asyncHandler(async (req, res) => {
  const books = await calculateBookProgress(req.user._id);
  sendSuccess(res, 200, { books });
});

/**
 * GET /api/progress/next
 * "غدًا" preview: next day's reading after the current marathon day.
 * Returns a completed state when the marathon is finished.
 */
const getNextDay = asyncHandler(async (req, res) => {
  const schedule = buildSchedule();
  const currentDay = marathonDate.getCurrentMarathonDay();

  // Marathon finished -> no next day
  if (marathonDate.isMarathonFinished()) {
    return sendSuccess(res, 200, {
      marathonState: "completed",
      nextDay: null,
      message: "The marathon has finished. Well done!",
    });
  }

  // Marathon not started yet -> Day 1 is next
  const nextDayNumber = currentDay ? currentDay + 1 : 1;
  const day = schedule[nextDayNumber - 1];

  sendSuccess(res, 200, {
    marathonState: marathonDate.isMarathonStarted() ? "active" : "not_started",
    nextDay: {
      dayNumber: day.dayNumber,
      date: day.date,
      title: day.title,
      books: day.books,
      chapters: day.chapters,
    },
  });
});

module.exports = { getProgress, getBookProgress, getNextDay };
