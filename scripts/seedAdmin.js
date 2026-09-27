require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");
const { validatePassword } = require("../utils/validators");

/**
 * Seed (or promote) the admin account from environment variables:
 *   ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
 * Run with: npm run seed:admin
 *
 * - Never creates duplicates.
 * - Never stores a plain-text password (bcrypt hash only).
 * - Does NOT run on server start; it is a manual, explicit step.
 */
const seedAdmin = async () => {
  await connectDB();

  const name = (process.env.ADMIN_NAME || "").trim();
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env before seeding");
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    throw new Error(`ADMIN_PASSWORD is invalid: ${passwordError}`);
  }

  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.role === "admin") {
      console.log(`✔ Admin already exists: ${email} (no duplicate created)`);
    } else {
      // Promote the existing account instead of duplicating it
      existing.role = "admin";
      if (name) existing.name = name;
      await existing.save();
      console.log(`✔ Existing user promoted to admin: ${email}`);
    }
  } else {
    const hashed = await User.hashPassword(password);
    await User.create({
      name: name || "Admin",
      email,
      password: hashed,
      role: "admin",
    });
    console.log(`✔ Admin created: ${email}`);
  }

  await mongoose.connection.close();
  console.log("MongoDB connection closed.");
};

seedAdmin().catch(async (err) => {
  console.error("✖ Seed failed:", err.message);
  try {
    await mongoose.connection.close();
  } catch (_e) {
    /* connection may not be open */
  }
  process.exit(1);
});
