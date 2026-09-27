/**
 * Central date utility for ALL marathon date logic.
 *
 * - Uses the Africa/Cairo local date (Egypt), not the server timezone.
 * - TEST_DATE_OVERRIDE (YYYY-MM-DD) is honored ONLY outside production.
 *
 * Every controller/service must use these functions instead of new Date() directly.
 */

const { MARATHON } = require("../config/marathonData");

const DAY_MS = 24 * 60 * 60 * 1000;

// Africa/Cairo has been UTC+3 (fixed, no DST) since 2023.
const CAIRO_OFFSET_MINUTES = 180;

/**
 * Resolve the effective date key ("YYYY-MM-DD" in Cairo time).
 * TEST_DATE_OVERRIDE works only when NODE_ENV !== "production".
 */
const getEffectiveDateKey = () => {
  const override = process.env.TEST_DATE_OVERRIDE;

  if (
    override &&
    process.env.NODE_ENV !== "production" &&
    /^\d{4}-\d{2}-\d{2}$/.test(override)
  ) {
    return override;
  }

  return getCurrentCairoDate();
};

/** Current Cairo local date as "YYYY-MM-DD". */
const getCurrentCairoDate = () => {
  const nowUtcMs = Date.now() + CAIRO_OFFSET_MINUTES * 60 * 1000;
  return new Date(nowUtcMs).toISOString().slice(0, 10);
};

/** "YYYY-MM-DD" -> Date at UTC midnight (pure date math, timezone-safe). */
const parseDateKey = (key) => {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Whole days from startDate to dateKey (Day 1 = startDate itself). */
const dayNumberForDateKey = (dateKey) =>
  Math.round((parseDateKey(dateKey) - parseDateKey(MARATHON.startDate)) / DAY_MS) + 1;

/** dayNumber (1..89) -> "YYYY-MM-DD". */
const dateKeyForDayNumber = (dayNumber) =>
  new Date(parseDateKey(MARATHON.startDate).getTime() + (dayNumber - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);

/** Current marathon day number, or null when outside the marathon window. */
const getCurrentMarathonDay = () => {
  const dateKey = getEffectiveDateKey();
  if (!isMarathonStarted() || isMarathonFinished()) return null;
  return dayNumberForDateKey(dateKey);
};

/** Number of marathon days that have fully elapsed (0 before start, max 89). */
const getElapsedDays = () => {
  const dateKey = getEffectiveDateKey();
  const dayNumber = dayNumberForDateKey(dateKey);
  if (dayNumber < 1) return 0;
  if (dayNumber > MARATHON.totalDays) return MARATHON.totalDays;
  return dayNumber; // today counts as an elapsed/active day
};

const isMarathonStarted = () => getEffectiveDateKey() >= MARATHON.startDate;

const isMarathonFinished = () => getEffectiveDateKey() > MARATHON.endDate;

module.exports = {
  CAIRO_OFFSET_MINUTES,
  getCurrentCairoDate,
  getEffectiveDateKey,
  parseDateKey,
  dayNumberForDateKey,
  dateKeyForDayNumber,
  getCurrentMarathonDay,
  getElapsedDays,
  isMarathonStarted,
  isMarathonFinished,
};
