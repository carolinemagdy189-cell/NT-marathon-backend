const User = require("../models/User");
const LoginEvent = require("../models/LoginEvent");
const asyncHandler = require("../utils/asyncHandler");
const { ApiError, sendSuccess } = require("../utils/apiError");
const { generateToken } = require("../utils/generateToken");
const { isValidEmail, validatePassword } = require("../utils/validators");

/**
 * POST /api/auth/register
 * Body: { name, email, password, confirmPassword }
 * Role is ALWAYS "user" here - admins are created only via seed script.
 */
const register = asyncHandler(async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const confirmPassword =
    typeof req.body.confirmPassword === "string" ? req.body.confirmPassword : "";

  // 1) Required fields + validation
  if (name.length < 2 || name.length > 80) {
    throw new ApiError(400, "Name must be between 2 and 80 characters");
  }
  if (!isValidEmail(email)) {
    throw new ApiError(400, "A valid email address is required");
  }
  const passwordError = validatePassword(password);
  if (passwordError) throw new ApiError(400, passwordError);
  if (password !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }

  // 2) Duplicate checks (friendly messages before hitting the unique index)
  const existingEmail = await User.findOne({ email }).lean();
  if (existingEmail) {
    throw new ApiError(409, "An account with this email already exists");
  }

  // 3) Hash + create (role is never taken from the request body)
  const hashed = await User.hashPassword(password);
  const user = await User.create({ name, email, password: hashed, role: "user" });

  // 4) JWT + safe user object (password excluded by the toJSON transform)
  const token = generateToken({ userId: user._id.toString(), role: user.role });

  sendSuccess(res, 201, { token, user: user.toJSON() });
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Records a LoginEvent and updates lastLoginAt on every successful login.
 */
const login = asyncHandler(async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new ApiError(401, "Invalid email or password");

  const matches = await user.comparePassword(password);
  if (!matches) throw new ApiError(401, "Invalid email or password");

  // Login tracking: event + last login time on the user
  await LoginEvent.create({ userId: user._id });
  user.lastLoginAt = new Date();
  await user.save();

  const token = generateToken({ userId: user._id.toString(), role: user.role });

  sendSuccess(res, 200, { token, user: user.toJSON() });
});

/** GET /api/auth/me (protected) - current user without the password. */
const getMe = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, req.user.toJSON());
});

/**
 * POST /api/auth/logout
 * JWT is stateless: the client drops the token. Endpoint exists so the
 * frontend has a consistent API to call.
 */
const logout = asyncHandler(async (_req, res) => {
  sendSuccess(res, 200, { message: "Logged out. Remove the token on the client." });
});

module.exports = { register, login, getMe, logout };
