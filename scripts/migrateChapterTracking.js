/**
 * Migration: chapter-level tracking.
 *
 * Backfills exact chapter data for legacy DailyReading records so book/overall
 * progress can be computed from actual unique chapters:
 *
 *   1. Every DailyReading without `chapters` spans gets canonical spans
 *      [{ book, start, end }] derived with the same rule the app always used
 *      for partial days (first N chapters of that day's plan, N =
 *      chaptersRead; a read beyond the day's assignment continues in
 *      canonical order into the following days' plans).
 *   2. Every chapter is inserted into the per-user `chapterreads` registry,
 *      whose unique index (userId, book, chapter) permanently prevents the
 *      same chapter from being counted twice.
 *
 * SAFE / IDEMPOTENT / NON-DESTRUCTIVE:
 *   - no user, record, reflection, status or date is modified or deleted;
 *   - only adds: `chapters` spans on legacy records + new registry docs;
 *   - can be re-run any number of times (duplicates are skipped by the
 *     unique index; already-migrated records are untouched).
 */

require("dotenv").config();
const mongoose = require("mongoose");
const DailyReading = require("../models/DailyReading");
const ChapterRead = require("../models/ChapterRead");
const { chaptersForReading } = require("../services/marathonService");

const BATCH_SIZE = 1000;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log("connected");

  // --- 1) Backfill `chapters` spans on legacy records -----------------------
  const legacy = await DailyReading.find({
    $or: [{ chapters: { $exists: false } }, { chapters: { $size: 0 } }],
  })
    .sort({ dayNumber: 1, savedAt: 1 })
    .lean();
  console.log(`legacy records without chapter spans: ${legacy.length}`);

  let backfilled = 0;
  for (const record of legacy) {
    const chapters = chaptersForReading(record.dayNumber, record.chaptersRead);
    const result = await DailyReading.updateOne(
      { _id: record._id, $or: [{ chapters: { $exists: false } }, { chapters: { $size: 0 } }] },
      { $set: { chapters } }
    );
    if (result.modifiedCount > 0) backfilled += 1;
  }
  console.log(`records backfilled with chapter spans: ${backfilled}`);

  // --- 2) Populate the chapterreads registry --------------------------------
  const before = await ChapterRead.countDocuments({});
  console.log(`chapterreads docs before: ${before}`);

  const records = await DailyReading.find({}).sort({ savedAt: 1 }).lean();
  const docs = [];
  for (const record of records) {
    for (const span of record.chapters || []) {
      for (let ch = span.start; ch <= span.end; ch += 1) {
        docs.push({
          userId: record.userId,
          book: span.book,
          chapter: ch,
          dayNumber: record.dayNumber,
          readAt: record.savedAt,
        });
      }
    }
    if (docs.length >= BATCH_SIZE) {
      await insertIgnoringDuplicates(docs.splice(0, BATCH_SIZE));
    }
  }
  await insertIgnoringDuplicates(docs);

  const after = await ChapterRead.countDocuments({});
  console.log(`chapterreads docs after: ${after} (inserted ${after - before})`);

  // --- 3) Sanity report -----------------------------------------------------
  const users = await ChapterRead.distinct("userId");
  console.log(`users with chapter-level data: ${users.length}`);
  console.log("migration finished (idempotent - safe to re-run)");

  await mongoose.disconnect();
})().catch((e) => {
  console.error("MIGRATION ERROR:", e);
  process.exit(1);
});

/** insertMany that tolerates duplicate-key collisions (already-registered chapters). */
async function insertIgnoringDuplicates(docs) {
  if (!docs.length) return 0;
  try {
    const res = await ChapterRead.insertMany(docs, { ordered: false });
    return res.length;
  } catch (err) {
    const isDup = (e) =>
      e && (e.code === 11000 || (e.writeErrors || []).some((w) => w.code === 11000));
    if (!isDup(err)) throw err;
    return err.insertedDocs ? err.insertedDocs.length : 0;
  }
}
