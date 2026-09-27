/**
 * Central progress calculations.
 * EVERY progress number in the app comes from these functions - controllers
 * never compute progress independently, keeping all numbers consistent.
 */

const DailyReading = require("../models/DailyReading");
const User = require("../models/User");
const LoginEvent = require("../models/LoginEvent");
const ReadingDay = require("../models/ReadingDay");
const { MARATHON, BIBLE_BOOKS, TOTAL_CHAPTERS } = require("../config/marathonData");
const marathonDate = require("../utils/marathonDate");
const { buildSchedule } = require("./marathonService");

/** Round to 2 decimals, e.g. 4.6153 -> 4.62 */
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0);

/**
 * Status of one day for one user.
 * completed: chaptersRead >= assigned
 * partial:   0 < chaptersRead < assigned
 * not_registered: no record at all
 */
const computeStatus = (chaptersRead, assignedChapters) => {
  if (!chaptersRead || chaptersRead <= 0) return "not_registered";
  if (chaptersRead >= assignedChapters) return "completed";
  return "partial";
};

/** Chapters that count toward the official 260-chapter journey for a record. */
const officialChaptersOf = (record) =>
  Math.min(record.chaptersRead, record.assignedChapters);

/**
 * Overall user progress from their DailyReading records.
 * @param {Array} records
 */
const calculateUserProgressFromRecords = (records) => {
  const safeRecords = Array.isArray(records) ? records : [];

  const chaptersRead = Math.min(
    safeRecords.reduce((sum, r) => sum + officialChaptersOf(r), 0),
    TOTAL_CHAPTERS // never exceed 260
  );

  const completedDays = safeRecords.filter((r) => r.status === "completed").length;
  const partialDays = safeRecords.filter((r) => r.status === "partial").length;

  const elapsedDays = marathonDate.getElapsedDays();
  // Days that passed without a full completion (never counts future days)
  const missedDays = Math.max(elapsedDays - completedDays - partialDays, 0);

  return {
    totalChapters: TOTAL_CHAPTERS,
    chaptersRead,
    chaptersRemaining: Math.max(TOTAL_CHAPTERS - chaptersRead, 0),
    journeyPercentage: pct(chaptersRead, TOTAL_CHAPTERS),
    currentDay: marathonDate.getCurrentMarathonDay(), // null before/after marathon
    totalDays: MARATHON.totalDays,
    elapsedDays,
    completedDays,
    partialDays,
    missedDays,
    // Clear definition: full completions / elapsed marathon days
    commitmentPercentage: pct(completedDays, elapsedDays),
  };
};

/** Load records then calculate overall progress for one user. */
const calculateUserProgress = async (userId) => {
  const records = await DailyReading.find({ userId })
    .select("chaptersRead assignedChapters status dayNumber")
    .lean();
  return calculateUserProgressFromRecords(records);
};

/**
 * Progress per New Testament book, derived from the official schedule plus
 * the user's records. Partial days contribute their first N chapters in
 * canonical order (N = chaptersRead).
 */
const calculateBookProgress = async (userId) => {
  const records = await DailyReading.find({ userId })
    .select("chaptersRead assignedChapters status dayNumber")
    .lean();
  return calculateBookProgressFromRecords(records);
};

const calculateBookProgressFromRecords = (records) => {
  const schedule = buildSchedule();
  const readByBook = new Map(BIBLE_BOOKS.map(([name]) => [name, 0]));

  for (const record of records) {
    const day = schedule[record.dayNumber - 1];
    if (!day) continue;

    let remaining = Math.min(record.chaptersRead, record.assignedChapters);
    for (const span of day.spans) {
      if (remaining <= 0) break;
      const spanSize = span.end - span.start + 1;
      const took = Math.min(remaining, spanSize);
      readByBook.set(span.book, (readByBook.get(span.book) || 0) + took);
      remaining -= took;
    }
  }

  return BIBLE_BOOKS.map(([name, total]) => {
    const read = Math.min(readByBook.get(name) || 0, total);
    return { book: name, chaptersRead: read, totalChapters: total, percentage: pct(read, total) };
  });
};

/**
 * Community cumulative progress: total chapters read by ALL users divided by
 * (users x 260). This is a participation metric, not unique-chapter coverage.
 */
const calculateCommunityProgress = async () => {
  const totalUsers = await User.countDocuments({ role: "user" });

  const agg = await DailyReading.aggregate([
    { $project: { capped: { $min: ["$chaptersRead", "$assignedChapters"] } } },
    { $group: { _id: null, total: { $sum: "$capped" } } },
  ]);

  const totalChaptersRead = agg.length ? agg[0].total : 0;
  const totalPossibleChapters = totalUsers * TOTAL_CHAPTERS;

  return {
    totalUsers,
    totalChaptersRead,
    totalPossibleChapters,
    communityPercentage: pct(totalChaptersRead, totalPossibleChapters),
  };
};

/** UTC [start, end) window of a Cairo local day. */
const cairoDayRangeUtc = (dateKey) => {
  const startMs = marathonDate.parseDateKey(dateKey).getTime() - marathonDate.CAIRO_OFFSET_MINUTES * 60 * 1000;
  return { start: new Date(startMs), end: new Date(startMs + 24 * 60 * 60 * 1000) };
};

/**
 * Per-user rows + summary for ONE selected date (admin table).
 * Works for any date: during and outside the marathon window.
 */
const calculateAdminDailyStats = async (dateKey) => {
  const readingDay = await ReadingDay.findOne({ date: dateKey }).lean();
  const assignedChapters = readingDay ? readingDay.chapters : 0;

  // Users (participants only, admins excluded)
  const userFilter = { role: "user" };
  const users = await User.find(userFilter)
    .select("name email lastLoginAt createdAt")
    .sort({ name: 1 })
    .lean();

  const dayNumber = readingDay ? readingDay.dayNumber : null;
  const readings = dayNumber
    ? await DailyReading.find({ dayNumber }).select("userId chaptersRead assignedChapters status reflection savedAt completedAt").lean()
    : [];
  const readingByUser = new Map(readings.map((r) => [String(r.userId), r]));

  // First login time of that Cairo day per user
  const { start, end } = cairoDayRangeUtc(dateKey);
  const logins = await LoginEvent.find({ loginAt: { $gte: start, $lt: end } })
    .sort({ loginAt: 1 })
    .select("userId loginAt")
    .lean();
  const loginByUser = new Map();
  for (const evt of logins) {
    const key = String(evt.userId);
    if (!loginByUser.has(key)) loginByUser.set(key, evt.loginAt); // keep earliest
  }

  // Overall official progress per user (single aggregation)
  const overallAgg = await DailyReading.aggregate([
    { $project: { userId: 1, capped: { $min: ["$chaptersRead", "$assignedChapters"] } } },
    { $group: { _id: "$userId", chaptersRead: { $sum: "$capped" } } },
  ]);
  const overallByUser = new Map(overallAgg.map((row) => [String(row._id), row.chaptersRead]));

  const summary = { totalUsers: users.length, completed: 0, partial: 0, notRegistered: 0 };

  const rows = users.map((user) => {
    const key = String(user._id);
    const record = readingByUser.get(key) || null;
    const status = dayNumber ? computeStatus(record?.chaptersRead, assignedChapters) : "not_registered";

    if (status === "completed") summary.completed += 1;
    else if (status === "partial") summary.partial += 1;
    else summary.notRegistered += 1;

    const overallRead = Math.min(overallByUser.get(key) || 0, TOTAL_CHAPTERS);

    return {
      id: key,
      name: user.name,
      email: user.email,
      today: {
        dayNumber,
        target: dayNumber ? assignedChapters : 0,
        reading: readingDay ? readingDay.title : null,
        chaptersRead: record ? record.chaptersRead : 0,
        status,
        reflection: record ? record.reflection : "",
        savedAt: record ? record.savedAt : null,
        completedAt: record ? record.completedAt : null,
      },
      overall: {
        chaptersRead: overallRead,
        totalChapters: TOTAL_CHAPTERS,
        remaining: Math.max(TOTAL_CHAPTERS - overallRead, 0),
        percentage: pct(overallRead, TOTAL_CHAPTERS),
      },
      loginAt: loginByUser.get(key) || null,
      lastLoginAt: user.lastLoginAt,
    };
  });

  return {
    date: dateKey,
    dayNumber,
    marathonActive: Boolean(readingDay),
    todayTarget: dayNumber ? assignedChapters : 0,
    todayReading: readingDay ? readingDay.title : null,
    summary: {
      ...summary,
      completedPercentage: pct(summary.completed, users.length),
      partialPercentage: pct(summary.partial, users.length),
      notRegisteredPercentage: pct(summary.notRegistered, users.length),
    },
    users: rows,
  };
};

module.exports = {
  computeStatus,
  calculateUserProgress,
  calculateUserProgressFromRecords,
  calculateBookProgress,
  calculateBookProgressFromRecords,
  calculateCommunityProgress,
  calculateAdminDailyStats,
  cairoDayRangeUtc,
};
