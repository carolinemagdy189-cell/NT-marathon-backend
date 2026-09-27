const DailyReading = require("../models/DailyReading");
const ReadingDay = require("../models/ReadingDay");
const asyncHandler = require("../utils/asyncHandler");
const { ApiError, sendSuccess } = require("../utils/apiError");
const marathonDate = require("../utils/marathonDate");
const { buildSchedule, getScheduleByDayNumber } = require("../services/marathonService");
const { computeStatus, calculateUserProgress } = require("../services/progressService");

const MIN_READ = 1;
const MAX_READ = 10; // covers the "5+" frontend option (user types the real count)

/** Timeline view of one schedule day, flagged with user state + future lock. */
const timelineEntry = (day, record, effectiveDateKey) => ({
  dayNumber: day.dayNumber,
  date: day.date,
  books: day.books,
  chapters: day.chapters,
  title: day.title,
  startChapter: day.startChapter,
  endChapter: day.endChapter,
  isPast: day.date < effectiveDateKey,
  isToday: day.date === effectiveDateKey,
  isFuture: day.date > effectiveDateKey,
  locked: day.date > effectiveDateKey, // future days cannot be opened
  status: record ? record.status : "not_registered",
  chaptersRead: record ? record.chaptersRead : 0,
  assignedChapters: day.chapters,
});

/**
 * GET /api/readings/today
 * Full home-dashboard payload: current day, progress, today's reading/status.
 */


const getToday = asyncHandler(async (req, res) => {
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("TEST_DATE_OVERRIDE:", process.env.TEST_DATE_OVERRIDE);
  console.log("Effective Date:", marathonDate.getEffectiveDateKey());
  console.log("Start Date:", require("../config/marathonData").MARATHON.startDate);
  console.log("End Date:", require("../config/marathonData").MARATHON.endDate);

  // باقي الكود...
  const dateKey = marathonDate.getEffectiveDateKey();
  const day = await ReadingDay.findOne({ date: dateKey }).lean();

  // Marathon has not started / already finished
  if (!day) {
    return sendSuccess(res, 200, {
      marathonState: marathonDate.isMarathonStarted() ? "completed" : "not_started",
      message: marathonDate.isMarathonStarted()
        ? "The marathon has finished. Well done!"
        : "The marathon has not started yet.",
      reading: null,
    });
  }

  const [record, progress] = await Promise.all([
    DailyReading.findOne({ userId: req.user._id, dayNumber: day.dayNumber }).lean(),
    calculateUserProgress(req.user._id),
  ]);

  sendSuccess(res, 200, {
    marathonState: "active",
    reading: {
      dayNumber: day.dayNumber,
      date: day.date,
      books: day.books,
      chapters: day.chapters,
      title: day.title,
      totalDays: 89,
    },
    todayStatus: record ? record.status : "not_registered",
    todayTarget: day.chapters,
    todayReflection: record ? record.reflection : "",
    savedAt: record ? record.savedAt : null,
    progress, // currentDay, chaptersRead/260, remaining, journey %, commitment...
  });
});

/**
 * POST /api/readings/today
 * Body: { chaptersRead, reflection }
 * - reflection is REQUIRED (non-empty after trim)
 * - future days cannot be submitted
 * - one record per user per day (unique index userId+dayNumber)
 * - "not_registered" is computed, never stored
 */
const submitToday = asyncHandler(async (req, res) => {
  const chaptersRead = req.body.chaptersRead;
  const reflection = typeof req.body.reflection === "string" ? req.body.reflection.trim() : "";

  // Validation: integer 1..10 ("5+" option sends the real count)
  if (!Number.isInteger(chaptersRead) || chaptersRead < MIN_READ || chaptersRead > MAX_READ) {
    throw new ApiError(400, `chaptersRead must be an integer between ${MIN_READ} and ${MAX_READ}`);
  }

  // Required reflection
  if (!reflection) {
    throw new ApiError(400, "A reflection is required. Please write something about today's reading.");
  }
  if (reflection.length > 2000) {
    throw new ApiError(400, "Reflection must be at most 2000 characters");
  }

  const dateKey = marathonDate.getEffectiveDateKey();
  const day = await ReadingDay.findOne({ date: dateKey });

  if (!day) {
    throw new ApiError(
      400,
      marathonDate.isMarathonStarted()
        ? "The marathon has finished. Submissions are closed."
        : "The marathon has not started yet."
    );
  }

  // Future protection is implicit (ReadingDay exists only for real days),
  // but keep an explicit guard for clarity and tests.
  if (dateKey > day.date) {
    throw new ApiError(400, "Cannot submit a reading for a future day");
  }

  // One submission per day - enforced by the unique compound index
  const existing = await DailyReading.findOne({ userId: req.user._id, dayNumber: day.dayNumber });
  if (existing) {
    throw new ApiError(409, "You already submitted today's reading");
  }

  const status = computeStatus(chaptersRead, day.chapters);
  const now = new Date();

  try {
    const record = await DailyReading.create({
      userId: req.user._id,
      readingDayId: day._id,
      dayNumber: day.dayNumber,
      assignedChapters: day.chapters,
      chaptersRead,
      status,
      reflection,
      savedAt: now,
      completedAt: status === "completed" ? now : null,
    });

    return sendSuccess(res, 201, {
      dayNumber: record.dayNumber,
      chaptersRead: record.chaptersRead,
      assignedChapters: record.assignedChapters,
      status: record.status,
      reflection: record.reflection,
      savedAt: record.savedAt,
      completedAt: record.completedAt,
    });
  } catch (err) {
    // Handle a rare race between two concurrent submissions
    if (err && err.code === 11000) {
      throw new ApiError(409, "You already submitted today's reading");
    }
    throw err;
  }
});

/**
 * GET /api/readings/timeline
 * All 89 days for the home scrollable list, with per-user status and locks.
 */
const getTimeline = asyncHandler(async (req, res) => {
  const dateKey = marathonDate.getEffectiveDateKey();

  const [days, records] = await Promise.all([
    ReadingDay.find().sort({ dayNumber: 1 }).lean(),
    DailyReading.find({ userId: req.user._id })
      .select("dayNumber chaptersRead status")
      .lean(),
  ]);

  const recordByDay = new Map(records.map((r) => [r.dayNumber, r]));

  sendSuccess(res, 200, {
    marathonState: !marathonDate.isMarathonStarted()
      ? "not_started"
      : marathonDate.isMarathonFinished()
        ? "completed"
        : "active",
    days: days.map((day) => timelineEntry(day, recordByDay.get(day.dayNumber), dateKey)),
  });
});

/**
 * GET /api/readings/history
 * Only the user's submitted records, newest first.
 */
const getHistory = asyncHandler(async (req, res) => {
  const records = await DailyReading.find({ userId: req.user._id })
    .sort({ dayNumber: -1 })
    .lean();

  const schedule = buildSchedule();

  const history = records.map((record) => {
    const day = schedule[record.dayNumber - 1] || {};
    return {
      dayNumber: record.dayNumber,
      date: day.date || null,
      books: day.books || [],
      title: day.title || "",
      assignedChapters: record.assignedChapters,
      chaptersRead: record.chaptersRead,
      status: record.status,
      reflection: record.reflection,
      savedAt: record.savedAt,
      completedAt: record.completedAt,
    };
  });

  sendSuccess(res, 200, { history });
});

/**
 * GET /api/readings/history/:dayNumber
 * Past days only: full details for that day (reading + user's record).
 * Future days are rejected with 403 (locked).
 */
const getHistoryByDay = asyncHandler(async (req, res) => {
  const dayNumber = Number(req.params.dayNumber);
  const day = getScheduleByDayNumber(dayNumber);
  if (!day) throw new ApiError(404, "Reading day not found");

  const dateKey = marathonDate.getEffectiveDateKey();
  if (day.date > dateKey) {
    throw new ApiError(403, "Future reading days are locked");
  }

  const record = await DailyReading.findOne({
    userId: req.user._id,
    dayNumber,
  }).lean();

  const dayDoc = await ReadingDay.findOne({ dayNumber }).lean();

  sendSuccess(res, 200, {
    day: {
      dayNumber: day.dayNumber,
      date: day.date,
      books: day.books,
      chapters: day.chapters,
      title: day.title,
    },
    record: record
      ? {
          chaptersRead: record.chaptersRead,
          assignedChapters: record.assignedChapters,
          status: record.status,
          reflection: record.reflection,
          savedAt: record.savedAt,
          completedAt: record.completedAt,
        }
      : null, // past day that the user did not register
    status: record ? record.status : "not_registered",
  });
});

module.exports = { getToday, submitToday, getTimeline, getHistory, getHistoryByDay };
