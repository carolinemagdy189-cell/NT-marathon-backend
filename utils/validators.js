/** Small validation helpers shared by controllers. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidEmail = (value) =>
  typeof value === "string" && value.trim().length <= 254 && EMAIL_RE.test(value.trim());

/** Escape user input before embedding it into a RegExp. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Parse a value as an integer within [min, max]; null when invalid. */
const toIntInRange = (value, { min, max }) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
};

/** Validate a "YYYY-MM-DD" date key. */
const isValidDateKey = (value) =>
  typeof value === "string" &&
  DATE_KEY_RE.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** Password policy: at least 8 characters. */
const validatePassword = (password) => {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (password.length > 128) {
    return "Password must be at most 128 characters";
  }
  return null;
};

module.exports = {
  isValidEmail,
  escapeRegex,
  toIntInRange,
  isValidDateKey,
  validatePassword,
};
