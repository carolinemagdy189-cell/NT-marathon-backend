const express = require("express");
const {
  getProgress,
  getBookProgress,
  getNextDay,
} = require("../controllers/progressController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect); // progress belongs to the logged-in user

router.get("/", getProgress);
router.get("/books", getBookProgress);
router.get("/next", getNextDay);
router.get("/me", getProgress); // alias of /

module.exports = router;
