/**
 * Central progress calculations.
 * EVERY progress number in the app comes from these functions - controllers
 * never compute progress independently, keeping all numbers consistent.
 */

const DailyReading = require("../models/DailyReading");
const ChapterRead = require("../models/ChapterRead");
const User = require("../models/User");
const LoginEvent = require("../models/LoginEvent");
const ReadingDay = require("../models/ReadingDay");
const { MARATHON, BIBLE_BOOKS, TOTAL_CHAPTERS } = require("../config/marathonData");
const marathonDate = require("../utils/marathonDate");
const { buildSchedule, chaptersForReading } = require("./marathonService");

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

/**
 * Unique (book, chapter) pairs a user has actually read, derived from their
 * DailyReading records. Exact stored `chapters` spans are used verbatim;
 * legacy records without them are derived with the canonical rule
 * (first N chapters of the day's plan, overflow continuing into following
 * days) — identical to what the migration script persists. A Set here means
 * overlapping submissions can never inflate progress.
 * @param {Array} records
 */
const uniqueChaptersFromRecords = (records) => {
  const safeRecords = Array.isArray(records) ? records : [];

  const unique = new Set();
  for (const record of safeRecords) {
    const count = Number(record.chaptersRead) || 0;
    if (count <= 0) continue;
    const spans =
      Array.isArray(record.chapters) && record.chapters.length > 0
        ? record.chapters
        : chaptersForReading(record.dayNumber, count);
    for (const span of spans) {
      for (let ch = span.start; ch <= span.end; ch += 1) {
        unique.add(`${span.book}:${ch}`);
      }
    }
  }

  return unique;
};

/**
 * Overall user progress from their DailyReading records: journey progress is
 * UNIQUE ACTUAL CHAPTERS READ out of 260 — never the number of submitted
 * forms, completed days, or commitment percentage.
 * @param {Array} records
 */
const calculateUserProgressFromRecords = (records) => {
  const safeRecords = Array.isArray(records) ? records : [];

  const uniqueRead = uniqueChaptersFromRecords(safeRecords);
  const chaptersRead = Math.min(uniqueRead.size, TOTAL_CHAPTERS); // can never exceed 260

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
    // Separate commitment metric: full completions / elapsed marathon days.
    // NEVER mix it with journeyPercentage (unique chapters / 260).
    commitmentPercentage: pct(completedDays, elapsedDays),
  };
};

/** Load records then calculate overall progress for one user. */
const calculateUserProgress = async (userId) => {
  const records = await DailyReading.find({ userId })
    .select("chaptersRead assignedChapters status dayNumber chapters")
    .lean();
  return calculateUserProgressFromRecords(records);
};

/**
 * Progress per New Testament book, from ACTUAL UNIQUE chapters read (the
 * ChapterRead registry, deduplicated by its unique index). Legacy users with
 * no registry entries yet fall back to the same unique-chapter derivation
 * from their records, so numbers are identical before and after migration.
 */
const calculateBookProgress = async (userId) => {
  const agg = await ChapterRead.aggregate([
    { $match: { userId: toObjectId(userId) } },
    { $group: { _id: "$book", chaptersRead: { $sum: 1 } } },
  ]);

  if (agg.length > 0) {
    const readByBook = new Map(agg.map((row) => [row._id, row.chaptersRead]));
    return booksFromMap(readByBook);
  }

  // Fallback (legacy, un-migrated records): derive the same unique set.
  const records = await DailyReading.find({ userId })
    .select("chaptersRead dayNumber chapters")
    .lean();
  return calculateBookProgressFromRecords(records);
};

const toObjectId = (id) => new (require("mongoose").Types.ObjectId)(String(id));

/**
 * Canonical New Testament order: every chapter #N (1..260) maps to a fixed
 * (book, chapter) pair. Used to translate "how many unique chapters has the
 * user actually read" into "where is the user now".
 */
const CANONICAL_NT_POSITIONS = (() => {
  const list = [];
  for (const [name, total] of BIBLE_BOOKS) {
    for (let ch = 1; ch <= total; ch += 1) {
      list.push({ book: name, chapter: ch });
    }
  }
  return list; // exactly 260 entries, canonical order
})();

/**
 * Current Journey position — derived ONLY from the actual unique chapters
 * read (never from completed days, daily submissions, or check-ins).
 * The position is canonical chapter #uniqueChaptersRead in the fixed New
 * Testament order, so it can never move backward when a daily check-in is
 * missed, and duplicated chapters are counted once because the input is a
 * deduplicated set size.
 * @param {number} uniqueChaptersRead size of the user's unique chapter set
 * @returns {null|Object} null when nothing has been read yet
 */
const calculateCurrentJourney = (uniqueChaptersRead) => {
  const clamped = Math.max(Math.min(Number(uniqueChaptersRead) || 0, TOTAL_CHAPTERS), 0);
  if (clamped === 0) return null;
  const position = CANONICAL_NT_POSITIONS[clamped - 1];
  /* Journey rows: only the books the user has actually reached, in canonical
     order. Books before the current position are always 100% (the canonical
     walk covers them); the current book shows the chapters actually reached,
     and NOTHING beyond the current position is rendered. */
  const journeyBooks = [];
  let remaining = clamped;
  for (const [name, total] of BIBLE_BOOKS) {
    const reached = Math.min(remaining, total);
    journeyBooks.push({
      book: name,
      chaptersRead: reached,
      totalChapters: total,
      percentage: pct(reached, total),
      isCurrent: name === position.book,
    });
    remaining -= reached;
    if (remaining === 0) break;
  }
  return {
    uniqueChaptersRead: clamped,
    totalChapters: TOTAL_CHAPTERS,
    journeyPercentage: pct(clamped, TOTAL_CHAPTERS),
    currentBook: position.book,
    currentChapter: position.chapter,
    ntCompleted: clamped === TOTAL_CHAPTERS,
    journeyBooks,
  };
};

/**
 * Unique chapter count for one user. The ChapterRead registry (exact stored
 * book/chapter records, deduplicated by its unique index) is the source of
 * truth; legacy users with no registry entries fall back to deriving the
 * same unique set from their DailyReading records.
 */
const getUserUniqueChapterCount = async (userId) => {
  const registryCount = await ChapterRead.countDocuments({ userId: toObjectId(userId) });
  if (registryCount > 0) return registryCount;
  const records = await DailyReading.find({ userId })
    .select("chaptersRead dayNumber chapters")
    .lean();
  return uniqueChaptersFromRecords(records).size;
};

/** Per-book result rows from a map of book -> unique chapters read. */
const booksFromMap = (readByBook) =>
  BIBLE_BOOKS.map(([name, total]) => {
    const read = Math.min(readByBook.get(name) || 0, total);
    return { book: name, chaptersRead: read, totalChapters: total, percentage: pct(read, total) };
  });

const calculateBookProgressFromRecords = (records) => {
  const readByChapter = new Map();
  for (const key of uniqueChaptersFromRecords(records)) {
    const idx = key.lastIndexOf(":");
    const book = key.slice(0, idx);
    const ch = Number(key.slice(idx + 1));
    if (!readByChapter.has(book)) readByChapter.set(book, new Set());
    readByChapter.get(book).add(ch);
  }
  const readByBook = new Map(
    [...readByChapter.entries()].map(([book, set]) => [book, set.size])
  );
  return booksFromMap(readByBook);
};

/**
 * Community cumulative progress: total chapters read by ALL users divided by
 * (users x 260). This is a participation metric, not unique-chapter coverage.
 */
const calculateCommunityProgress = async () => {
  const totalUsers = await User.countDocuments({ role: "user" });

  const agg = await DailyReading.aggregate([
    { $group: { _id: null, total: { $sum: "$chaptersRead" } } },
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

/** UTC [start, end) window of a Cairo local day (DST-aware, offset-free). */
const cairoDayRangeUtc = (dateKey) => {
  return {
    start: new Date(marathonDate.cairoDayStartUtc(dateKey)),
    end: new Date(marathonDate.cairoDayEndUtc(dateKey)),
  };
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

  // Overall journey progress per user: UNIQUE chapters read (single
  // aggregation over the deduplicated per-user chapter registry, filled by
  // scripts/migrateChapterTracking.js and on every new submission.
  const overallAgg = await ChapterRead.aggregate([
    { $group: { _id: "$userId", chaptersRead: { $sum: 1 } } },
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
  calculateCurrentJourney,
  getUserUniqueChapterCount,
  calculateCommunityProgress,
  calculateAdminDailyStats,
  cairoDayRangeUtc,
};
