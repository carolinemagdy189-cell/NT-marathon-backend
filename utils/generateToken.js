const jwt = require("jsonwebtoken");

/** Sign a JWT payload such as { userId, role }. */
const generateToken = (payload) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not set. Add it to .env (see .env.example).");
  }

  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

/** Verify a JWT - throws on invalid/expired tokens. */
const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not set. Add it to .env (see .env.example).");
  }

  return jwt.verify(token, secret);
};

module.exports = { generateToken, verifyToken };
