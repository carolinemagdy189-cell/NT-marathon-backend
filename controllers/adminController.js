const User = require("../models/User");
const DailyReading = require("../models/DailyReading");
const ReadingDay = require("../models/ReadingDay");
const asyncHandler = require("../utils/asyncHandler");
const { ApiError, sendSuccess } = require("../utils/apiError");
const { escapeRegex, toIntInRange, isValidDateKey } = require("../utils/validators");
const marathonDate = require("../utils/marathonDate");
const { getDashboard } = require("../services/adminService");
const {
  calculateAdminDailyStats,
  calculateCommunityProgress,
  calculateUserProgress,
} = require("../services/progressService");
const { buildSchedule } = require("../services/marathonService");

/**
 * GET /api/admin/dashboard
 * Live stats for the admin dashboard (frontend polls every 60 seconds).
 * Optional ?date=YYYY-MM-DD to view a previous day.
 */
const getDashboardData = asyncHandler(async (req, res) => {
  let dateKey;
  if (req.query.date) {
    if (!isValidDateKey(req.query.date)) {
      throw new ApiError(400, "date must be a valid YYYY-MM-DD");
    }
    dateKey = req.query.date;
  }
  const dashboard = await getDashboard(dateKey);
  sendSuccess(res, 200, dashboard);
});

/**
 * GET /api/admin/users
 * Paginated user list with per-date status, search by name/email.
 * Query: ?search=&status=&page=&limit=&date=
 */
const getUsers = asyncHandler(async (req, res) => {
  const page = toIntInRange(req.query.page, { min: 1, max: 1_000_000 }) ?? 1;
  const limit = toIntInRange(req.query.limit, { min: 1, max: 100 }) ?? 10;

  const dateKey = req.query.date
    ? (isValidDateKey(req.query.date) ? req.query.date : null)
    : marathonDate.getEffectiveDateKey();
  if (req.query.date && !dateKey) {
    throw new ApiError(400, "date must be a valid YYYY-MM-DD");
  }

  // Daily stats for the selected date (includes the full user table)
  const daily = await calculateAdminDailyStats(dateKey);

  // Optional filters applied on the computed rows
  let rows = daily.users;
  if (req.query.search && String(req.query.search).trim()) {
    const rx = new RegExp(escapeRegex(req.query.search.trim()), "i");
    rows = rows.filter((u) => rx.test(u.name) || rx.test(u.email));
  }
  if (req.query.status && ["completed", "partial", "not_registered"].includes(req.query.status)) {
    rows = rows.filter((u) => u.today.status === req.query.status);
  }

  const totalRows = rows.length;
  const paged = rows.slice((page - 1) * limit, page * limit);

  sendSuccess(res, 200, {
    date: daily.date,
    dayNumber: daily.dayNumber,
    page,
    limit,
    totalUsers: totalRows,
    returned: paged.length,
    summary: daily.summary,
    users: paged,
  });
});

/**
 * GET /api/admin/users/:id
 * One participant: info + overall progress + full reading history.
 */
const getUserDetails = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");
  if (!user) throw new ApiError(404, "User not found");

  const [progress, records] = await Promise.all([
    calculateUserProgress(user._id),
    DailyReading.find({ userId: user._id }).sort({ dayNumber: 1 }).lean(),
  ]);

  const schedule = buildSchedule();
  const history = records.map((record) => {
    const day = schedule[record.dayNumber - 1] || {};
    return {
      dayNumber: record.dayNumber,
      date: day.date || null,
      title: day.title || "",
      assignedChapters: record.assignedChapters,
      chaptersRead: record.chaptersRead,
      status: record.status,
      reflection: record.reflection,
      savedAt: record.savedAt,
      completedAt: record.completedAt,
    };
  });

  sendSuccess(res, 200, {
    user: user.toJSON(),
    progress,
    history,
  });
});

/**
 * GET /api/admin/readings?date=YYYY-MM-DD
 * Per-user reading rows for one date (admin readings screen).
 */
const getReadingsByDate = asyncHandler(async (req, res) => {
  const dateKey = req.query.date || marathonDate.getEffectiveDateKey();
  if (!isValidDateKey(dateKey)) {
    throw new ApiError(400, "date must be a valid YYYY-MM-DD");
  }

  const stats = await calculateAdminDailyStats(dateKey);
  sendSuccess(res, 200, {
    date: stats.date,
    dayNumber: stats.dayNumber,
    marathonActive: stats.marathonActive,
    todayTarget: stats.todayTarget,
    todayReading: stats.todayReading,
    summary: stats.summary,
    readings: stats.users,
  });
});

/**
 * GET /api/admin/progress
 * Community cumulative progress + per-user overall progress list.
 */
const getProgressOverview = asyncHandler(async (req, res) => {
  const community = await calculateCommunityProgress();

  const users = await User.find({ role: "user" })
    .select("name email lastLoginAt")
    .sort({ name: 1 })
    .lean();

  const perUser = await Promise.all(
    users.map(async (user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      lastLoginAt: user.lastLoginAt,
      progress: await calculateUserProgress(user._id),
    }))
  );

  sendSuccess(res, 200, { community, users: perUser });
});

/**
 * GET /api/admin/calendar
 * The 89 marathon days with per-day counts (for the admin calendar filter).
 */
const getCalendar = asyncHandler(async (_req, res) => {
  const days = await ReadingDay.find().sort({ dayNumber: 1 }).lean();

  const counts = await DailyReading.aggregate([
    { $group: { _id: { dayNumber: "$dayNumber", status: "$status" }, count: { $sum: 1 } } },
  ]);

  const byDay = new Map();
  for (const row of counts) {
    const dayCounts = byDay.get(row._id.dayNumber) || { completed: 0, partial: 0 };
    if (row._id.status === "completed") dayCounts.completed = row.count;
    if (row._id.status === "partial") dayCounts.partial = row.count;
    byDay.set(row._id.dayNumber, dayCounts);
  }

  sendSuccess(res, 200, {
    days: days.map((day) => ({
      dayNumber: day.dayNumber,
      date: day.date,
      title: day.title,
      chapters: day.chapters,
      completed: byDay.get(day.dayNumber)?.completed || 0,
      partial: byDay.get(day.dayNumber)?.partial || 0,
    })),
  });
});

module.exports = {
  getDashboardData,
  getUsers,
  getUserDetails,
  getReadingsByDate,
  getProgressOverview,
  getCalendar,
};
