const express = require("express");
const {
  getDashboardData,
  getUsers,
  getUserDetails,
  getReadingsByDate,
  getProgressOverview,
  getCalendar,
} = require("../controllers/adminController");
const { protect } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");

const router = express.Router();

router.use(protect, requireAdmin); // every admin route requires role = "admin"

router.get("/dashboard", getDashboardData);
router.get("/users", getUsers);
router.get("/users/:id", getUserDetails);
router.get("/readings", getReadingsByDate);
router.get("/progress", getProgressOverview);
router.get("/calendar", getCalendar);

module.exports = router;
