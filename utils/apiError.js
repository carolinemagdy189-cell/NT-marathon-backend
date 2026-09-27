/** Central API error type + consistent JSON response helpers. */

class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** Error: { success: false, message } */
const sendError = (res, statusCode, message, details) => {
  const payload = { success: false, message };
  if (details) payload.details = details;
  return res.status(statusCode).json(payload);
};

/** Success: { success: true, data } */
const sendSuccess = (res, statusCode, data) =>
  res.status(statusCode).json({ success: true, data });

module.exports = { ApiError, sendError, sendSuccess };
