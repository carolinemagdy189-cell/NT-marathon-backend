const User = require("../models/User");
const { verifyToken } = require("../utils/generateToken");
const { ApiError } = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Requires "Authorization: Bearer <token>".
 * Verifies the JWT, loads the user from the database (role always comes from
 * the DB, never from the token body alone) and attaches it to req.user.
 */
const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    throw new ApiError(401, "Not authenticated. Please provide a Bearer token.");
  }

  const token = header.slice(7).trim();
  if (!token) {
    throw new ApiError(401, "Not authenticated. Please provide a Bearer token.");
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (_err) {
    throw new ApiError(401, "Invalid or expired token");
  }

  const user = await User.findById(decoded.userId);
  if (!user) {
    throw new ApiError(401, "User account no longer exists");
  }

  req.user = user;
  next();
});

module.exports = { protect };
