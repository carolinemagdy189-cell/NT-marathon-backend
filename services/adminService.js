/**
 * Admin dashboard service. All numbers are computed live from MongoDB via
 * the shared progressService functions - never hardcoded, never cached.
 */

const ReadingDay = require("../models/ReadingDay");
const DailyReading = require("../models/DailyReading");
const { MARATHON } = require("../config/marathonData");
const marathonDate = require("../utils/marathonDate");
const {
  calculateCommunityProgress,
  calculateAdminDailyStats,
  computeStatus,
} = require("./progressService");

/** Build the full admin dashboard payload for an optional selected date. */
const getDashboard = async (dateKey) => {
  const todayKey = marathonDate.getEffectiveDateKey();
  const selectedDate = dateKey || todayKey;

  const [dailyStats, community] = await Promise.all([
    calculateAdminDailyStats(selectedDate),
    calculateCommunityProgress(),
  ]);

  const todayReadingDay = await ReadingDay.findOne({ date: todayKey }).lean();

  // Overall marathon progress = community position within the 89-day window
  const currentDay = marathonDate.getCurrentMarathonDay();
  const overallMarathonProgress = currentDay
    ? Math.round((currentDay / MARATHON.totalDays) * 10000) / 100
    : null;

  return {
    date: selectedDate,
    isToday: selectedDate === todayKey,
    marathon: {
      started: marathonDate.isMarathonStarted(),
      finished: marathonDate.isMarathonFinished(),
      currentDay, // null before Oct 1 / after Dec 28
      totalDays: MARATHON.totalDays,
      overallMarathonProgress, // % of days elapsed in the marathon itself
      todayTarget: todayReadingDay ? todayReadingDay.chapters : 0,
      todayReading: todayReadingDay ? todayReadingDay.title : null,
    },
    stats: dailyStats.summary, // totalUsers, completed, partial, notRegistered + percentages
    // Selected-day details (equal to today when no ?date= is passed)
    dayNumber: dailyStats.dayNumber,
    marathonActive: dailyStats.marathonActive,
    selectedDayTarget: dailyStats.todayTarget,
    selectedDayReading: dailyStats.todayReading,
    community, // cumulative participation metric across all users
    users: dailyStats.users, // per-user table rows for the selected date
  };
};

module.exports = { getDashboard };
