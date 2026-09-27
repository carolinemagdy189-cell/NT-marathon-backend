/**
 * Single source of truth for marathon constants and the New Testament books.
 * The 89-day schedule is DERIVED from this data - never duplicated elsewhere.
 */

const MARATHON = {
  name: "New Testament Marathon",
  startDate: "2026-10-01", // Day 1
  endDate: "2026-12-28", // Day 89
  totalDays: 89,
  totalChapters: 260,
  timezone: "Africa/Cairo",
};

// Canonical order: [book name (Arabic), chapter count]
// Sum must always be exactly 260 (verified below and in tests).
const BIBLE_BOOKS = [
  ["متى", 28],
  ["مرقس", 16],
  ["لوقا", 24],
  ["يوحنا", 21],
  ["أعمال الرسل", 28],
  ["رومية", 16],
  ["1 كورنثوس", 16],
  ["2 كورنثوس", 13],
  ["غلاطية", 6],
  ["أفسس", 6],
  ["فيلبي", 4],
  ["كولوسي", 4],
  ["1 تسالونيكي", 5],
  ["2 تسالونيكي", 3],
  ["1 تيموثاوس", 6],
  ["2 تيموثاوس", 4],
  ["تيطس", 3],
  ["فليمون", 1],
  ["العبرانيين", 13],
  ["يعقوب", 5],
  ["1 بطرس", 5],
  ["2 بطرس", 3],
  ["1 يوحنا", 5],
  ["2 يوحنا", 1],
  ["3 يوحنا", 1],
  ["يهوذا", 1],
  ["الرؤيا", 22],
];

const TOTAL_CHAPTERS = BIBLE_BOOKS.reduce((sum, [, chapters]) => sum + chapters, 0);

if (TOTAL_CHAPTERS !== MARATHON.totalChapters) {
  throw new Error(
    `Invalid Bible data: expected ${MARATHON.totalChapters} chapters, got ${TOTAL_CHAPTERS}`
  );
}

module.exports = { MARATHON, BIBLE_BOOKS, TOTAL_CHAPTERS };
