const { ApiError } = require("../utils/apiError");

/** Must run after authMiddleware (requires req.user). */
const requireAdmin = (req, _res, next) => {
  if (!req.user || req.user.role !== "admin") {
    // 403 with the standard JSON error shape
    return next(new ApiError(403, "You do not have permission to access this resource"));
  }
  next();
};

module.exports = { requireAdmin };
