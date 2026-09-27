const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");

const { buildSchedule, getScheduleByDayNumber } = require("../services/marathonService");
const { MARATHON, BIBLE_BOOKS, TOTAL_CHAPTERS } = require("../config/marathonData");
const marathonDate = require("../utils/marathonDate");

const schedule = buildSchedule();

test("schedule has exactly 89 days with correct boundary dates", () => {
  assert.strictEqual(schedule.length, 89);
  assert.strictEqual(schedule[0].dayNumber, 1);
  assert.strictEqual(schedule[0].date, "2026-10-01");
  assert.strictEqual(schedule[88].dayNumber, 89);
  assert.strictEqual(schedule[88].date, "2026-12-28");

  // consecutive dates
  for (let i = 1; i < schedule.length; i += 1) {
    const diff =
      (marathonDate.parseDateKey(schedule[i].date) -
        marathonDate.parseDateKey(schedule[i - 1].date)) /
      86400000;
    assert.strictEqual(diff, 1, `date gap between day ${i} and ${i + 1}`);
  }
});

test("chapter distribution is exactly 82x3 + 7x2 = 260", () => {
  const threeChapterDays = schedule.filter((d) => d.chapters === 3).length;
  const twoChapterDays = schedule.filter((d) => d.chapters === 2).length;

  assert.strictEqual(threeChapterDays, 82);
  assert.strictEqual(twoChapterDays, 7);
  assert.strictEqual(threeChapterDays * 3 + twoChapterDays * 2, 260);
  assert.strictEqual(schedule.reduce((s, d) => s + d.chapters, 0), TOTAL_CHAPTERS);
});

test("7 two-chapter days are spread as evenly as possible", () => {
  const twoDays = schedule.filter((d) => d.chapters === 2).map((d) => d.dayNumber);

  assert.strictEqual(twoDays.length, 7);
  // Even spread: gap between consecutive 2-chapter days is ~89/7 ≈ 12.7 days
  const gaps = [];
  for (let i = 1; i < twoDays.length; i += 1) gaps.push(twoDays[i] - twoDays[i - 1]);
  for (const gap of gaps) {
    assert.ok(gap >= 12 && gap <= 14, `uneven gap between 2-chapter days: ${gap}`);
  }
  // No big holes at the edges either
  assert.ok(twoDays[0] <= 13, "first 2-chapter day should come early");
  assert.ok(twoDays[6] >= 77, "last 2-chapter day should come late");
});

test("schedule covers متى 1 → الرؤيا 22 with no duplicates or missing chapters", () => {
  assert.strictEqual(schedule[0].books[0], "متى");
  assert.strictEqual(schedule[0].startChapter, 1);

  const last = schedule[88];
  assert.strictEqual(last.books[last.books.length - 1], "الرؤيا");
  assert.strictEqual(last.endChapter, 22);

  // Flatten every (book, chapter) and verify canonical order exactly once
  const flat = [];
  for (const day of schedule) {
    for (const span of day.spans) {
      for (let c = span.start; c <= span.end; c += 1) flat.push([span.book, c]);
    }
  }
  assert.strictEqual(flat.length, 260);

  let idx = 0;
  for (const [book, chapters] of BIBLE_BOOKS) {
    for (let c = 1; c <= chapters; c += 1) {
      assert.strictEqual(flat[idx][0], book, `position ${idx}: expected ${book}`);
      assert.strictEqual(flat[idx][1], c, `position ${idx}: expected chapter ${c}`);
      idx += 1;
    }
  }
  assert.strictEqual(idx, 260);
});

test("every day has consistent fields and per-book spans", () => {
  for (const day of schedule) {
    assert.ok(day.title && day.title.length > 0);
    assert.ok(day.books.length >= 1 && day.books.length <= 3);
    const spanSum = day.spans.reduce((s, sp) => s + (sp.end - sp.start + 1), 0);
    assert.strictEqual(spanSum, day.chapters);
    assert.strictEqual(day.startChapter, day.spans[0].start);
    assert.strictEqual(day.endChapter, day.spans[day.spans.length - 1].end);
    assert.strictEqual(day.books[0], day.spans[0].book);
  }
});

test("documented examples: Day 1 = متى 1-3, Day 4 = متى 10-12", () => {
  assert.strictEqual(schedule[0].title, "متى 1-3");
  assert.strictEqual(schedule[3].title, "متى 10-12");
  assert.strictEqual(getScheduleByDayNumber(4).title, "متى 10-12");
  assert.strictEqual(getScheduleByDayNumber(0), null);
  assert.strictEqual(getScheduleByDayNumber(90), null);
});

// ---- Date utility (Cairo timezone + TEST_DATE_OVERRIDE) ----

const originalEnv = { ...process.env };

test.beforeEach(() => {
  process.env.NODE_ENV = "development";
  delete process.env.TEST_DATE_OVERRIDE;
});

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test("getCurrentMarathonDay uses TEST_DATE_OVERRIDE in development", () => {
  process.env.TEST_DATE_OVERRIDE = "2026-10-04";
  assert.strictEqual(marathonDate.getEffectiveDateKey(), "2026-10-04");
  assert.strictEqual(marathonDate.getCurrentMarathonDay(), 4);
  assert.strictEqual(marathonDate.getElapsedDays(), 4);
  assert.strictEqual(marathonDate.isMarathonStarted(), true);
  assert.strictEqual(marathonDate.isMarathonFinished(), false);
});

test("Day 1 and Day 89 boundaries", () => {
  process.env.TEST_DATE_OVERRIDE = "2026-10-01";
  assert.strictEqual(marathonDate.getCurrentMarathonDay(), 1);

  process.env.TEST_DATE_OVERRIDE = "2026-12-28";
  assert.strictEqual(marathonDate.getCurrentMarathonDay(), 89);
  assert.strictEqual(marathonDate.getElapsedDays(), 89);
});

test("before October 1: no current day, marathon not started", () => {
  process.env.TEST_DATE_OVERRIDE = "2026-09-30";
  assert.strictEqual(marathonDate.getCurrentMarathonDay(), null);
  assert.strictEqual(marathonDate.isMarathonStarted(), false);
  assert.strictEqual(marathonDate.getElapsedDays(), 0);
});

test("after December 28: marathon finished, never Day 90", () => {
  process.env.TEST_DATE_OVERRIDE = "2026-12-29";
  assert.strictEqual(marathonDate.getCurrentMarathonDay(), null);
  assert.strictEqual(marathonDate.isMarathonFinished(), true);
  assert.strictEqual(marathonDate.getElapsedDays(), 89);
});

test("TEST_DATE_OVERRIDE is IGNORED in production", () => {
  process.env.NODE_ENV = "production";
  process.env.TEST_DATE_OVERRIDE = "2026-10-04";
  const key = marathonDate.getEffectiveDateKey();
  // In production the override must not apply: the result is the real Cairo date,
  // which is definitely not the override value.
  assert.notStrictEqual(key, "2026-10-04");
});

test("Cairo local date: 2026-01-01 01:00 Cairo == 2025-12-31 UTC", () => {
  // 2026-01-01T01:00+03:00 => Cairo date is 2026-01-01 while UTC is 2025-12-31 22:00
  const realNow = Date.now;
  Date.now = () => Date.parse("2025-12-31T22:00:00Z");
  try {
    assert.strictEqual(marathonDate.getCurrentCairoDate(), "2026-01-01");
  } finally {
    Date.now = realNow;
  }
});
