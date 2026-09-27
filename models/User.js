const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const ROLES = ["user", "admin"];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name must be at most 80 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true, // unique index on email
      lowercase: true, // always stored in lowercase
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // never returned unless explicitly selected
    },
    role: {
      type: String,
      enum: { values: ROLES, message: "Invalid role" },
      default: "user",
    },
    profileImage: { type: String, default: "" },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: {
      transform(_doc, ret) {
        delete ret.password; // never expose the hash
        delete ret.__v;
        return ret;
      },
    },
  }
);

/** Hash a plain password with bcrypt (used by register and seed script). */
userSchema.statics.hashPassword = async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
};

/** Compare a plain password against the stored bcrypt hash. */
userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;
