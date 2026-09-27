require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { buildSchedule, syncScheduleToDatabase } = require("../services/marathonService");
const { BIBLE_BOOKS } = require("../config/marathonData");

/**
 * Seed the 89 marathon days into MongoDB.
 * Run with: npm run seed:readings
 *
 * - Idempotent: re-running updates in place, never duplicates.
 * - Verifies exactly 89 days and exactly 260 chapters (no duplicates/missing)
 *   BEFORE writing anything to the database.
 */
const seedReadings = async () => {
  await connectDB();

  // ----- Self-verification of the generated schedule -----
  const schedule = buildSchedule();
  const totalChapters = schedule.reduce((sum, d) => sum + d.chapters, 0);

  if (schedule.length !== 89 || totalChapters !== 260) {
    throw new Error(
      `Schedule verification failed: ${schedule.length} days / ${totalChapters} chapters (expected 89 / 260)`
    );
  }

  // Flatten all assigned chapters and compare with the canonical book list
  const flat = [];
  for (const day of schedule) {
    for (const span of day.spans) {
      for (let c = span.start; c <= span.end; c += 1) {
        flat.push([span.book, c]);
      }
    }
  }

  let position = 0;
  for (const [book, chaptersInBook] of BIBLE_BOOKS) {
    for (let c = 1; c <= chaptersInBook; c += 1) {
      const [flatBook, flatChapter] = flat[position];
      if (flatBook !== book || flatChapter !== c) {
        throw new Error(
          `Schedule order broken at position ${position}: expected ${book} ${c}, got ${flatBook} ${flatChapter}`
        );
      }
      position += 1;
    }
  }

  if (position !== 260) {
    throw new Error(`Expected to verify 260 chapters, verified ${position}`);
  }

  // ----- Write to MongoDB (idempotent upsert by dayNumber) -----
  const result = await syncScheduleToDatabase();

  await mongoose.connection.close();

  console.log(
    [
      "",
      `${result.total} reading days created (${result.created} new, ${result.updated} updated)`,
      `${result.chapters} chapters assigned`,
      "Start: October 1, 2026",
      "End: December 28, 2026",
      "",
    ].join("\n")
  );
  console.log("MongoDB connection closed.");
};

seedReadings().catch(async (err) => {
  console.error("✖ Seed failed:", err.message);
  try {
    await mongoose.connection.close();
  } catch (_e) {
    /* connection may not be open */
  }
  process.exit(1);
});
