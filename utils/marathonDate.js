/**
 * Central date utility for ALL marathon date logic.
 *
 * - Uses the Africa/Cairo local date (Egypt), not the server timezone.
 * - Egypt uses daylight saving time again since 2023: UTC+2 in winter and
 *   UTC+3 in summer, so NO fixed UTC offset is ever assumed. All Cairo wall
 *   clock values are derived with Intl.DateTimeFormat({ timeZone:
 *   "Africa/Cairo" }), which resolves the correct offset for any instant.
 * - TEST_DATE_OVERRIDE (YYYY-MM-DD) is honored ONLY outside production.
 *
 * Every controller/service must use these functions instead of new Date() directly.
 */

const { MARATHON } = require("../config/marathonData");

const SECOND_MS = 1000;
const HOUR_MS = 60 * 60 * SECOND_MS;
const DAY_MS = 24 * HOUR_MS;

/** Single source of truth for the app's local timezone (no fixed offset). */
const CAIRO_TIMEZONE = "Africa/Cairo";

/**
 * Calendar date ("YYYY-MM-DD") of an absolute instant, as seen on the
 * Africa/Cairo wall clock. Intl resolves Egypt's UTC+2 / UTC+3 automatically,
 * including all historical and future DST transitions.
 */
const cairoDateKeyAt = (ms) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms)); // en-CA renders ISO-like: "YYYY-MM-DD"

/** Current Cairo local date as "YYYY-MM-DD". */
const getCurrentCairoDate = () => cairoDateKeyAt(Date.now());

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

/** "YYYY-MM-DD" -> Date at UTC midnight (pure date math, timezone-safe). */
const parseDateKey = (key) => {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * First UTC instant that belongs to the Cairo calendar day `dateKey`
 * (i.e. Cairo local midnight). DST-safe: binary-search the exact boundary
 * instant by its Cairo calendar date, so it is correct on normal days,
 * on winter (UTC+2) and summer (UTC+3) days, and on transition nights where
 * local midnight itself is skipped or repeated.
 */
const cairoDayStartUtc = (dateKey) => {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  const approxUtcMidnight = Date.UTC(y, m - 1, d);

  // Cairo is at most ±3h from UTC, so ±14h certainly brackets the boundary:
  // below -> previous Cairo date, above -> this Cairo date.
  let low = approxUtcMidnight - 14 * HOUR_MS;
  let high = approxUtcMidnight + 14 * HOUR_MS;

  while (high - low > SECOND_MS) {
    const mid = Math.floor((low + high) / 2 / SECOND_MS) * SECOND_MS;
    if (cairoDateKeyAt(mid) < dateKey) low = mid;
    else high = mid;
  }

  return high; // first instant whose Cairo calendar date is `dateKey`
};

/** First UTC instant of the Cairo day following `dateKey`. */
const cairoDayEndUtc = (dateKey) =>
  cairoDayStartUtc(
    new Date(parseDateKey(dateKey).getTime() + DAY_MS).toISOString().slice(0, 10)
  );

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
  CAIRO_TIMEZONE,
  cairoDateKeyAt,
  getCurrentCairoDate,
  getEffectiveDateKey,
  cairoDayStartUtc,
  cairoDayEndUtc,
  parseDateKey,
  dayNumberForDateKey,
  dateKeyForDayNumber,
  getCurrentMarathonDay,
  getElapsedDays,
  isMarathonStarted,
  isMarathonFinished,
};
