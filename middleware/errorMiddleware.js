const { ApiError, sendError } = require("../utils/apiError");

/** 404 for unknown routes - keeps the same JSON shape. */
const notFoundHandler = (req, res) =>
  sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Known, intentional API errors
  if (err instanceof ApiError) {
    return sendError(res, err.statusCode, err.message, err.details);
  }

  // Mongoose validation errors -> 400 with field messages
  if (err && err.name === "ValidationError") {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return sendError(res, 400, "Validation failed", messages);
  }

  // Invalid MongoDB ObjectId -> 400
  if (err && err.name === "CastError") {
    return sendError(res, 400, "Invalid id format");
  }

  // Duplicate key -> 409 (email / username / userId+dayNumber etc.)
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return sendError(res, 409, `Duplicate value for ${field}`);
  }

  // Malformed JSON body -> 400
  if (err && err.type === "entity.parse.failed") {
    return sendError(res, 400, "Invalid JSON body");
  }

  // Unexpected errors: log server-side, hide details in production
  console.error("[error]", err);
  return sendError(
    res,
    500,
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error"
  );
};

module.exports = { notFoundHandler, errorHandler };
