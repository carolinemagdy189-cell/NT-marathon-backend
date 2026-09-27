const express = require("express");
const {
  getToday,
  submitToday,
  getTimeline,
  getHistory,
  getHistoryByDay,
} = require("../controllers/readingController");
const {
  getProgress,
  getBookProgress,
  getNextDay,
} = require("../controllers/progressController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect); // every route here requires a logged-in user

// Today
router.get("/today", getToday);
router.post("/today", submitToday);

// Timeline + history
router.get("/timeline", getTimeline);
router.get("/history", getHistory);
router.get("/history/:dayNumber", getHistoryByDay);

// Progress
router.get("/progress/me", getProgress);
router.get("/progress/books", getBookProgress);
router.get("/progress/next", getNextDay);

module.exports = router;
