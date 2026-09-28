require('node:dns').setServers(['8.8.8.8', '1.1.1.1'])
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const { notFoundHandler, errorHandler } = require("./middleware/errorMiddleware");
const authRoutes = require("./routes/authRoutes");
const readingRoutes = require("./routes/readingRoutes");
const progressRoutes = require("./routes/progressRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

/** CORS from CLIENT_URL (comma-separated). Empty value allows local dev. */
const buildCorsOptions = () => {
  const raw = (process.env.CLIENT_URL || "").trim();
  if (!raw) return { origin: true };

  const origins = raw.split(",").map((o) => o.trim()).filter(Boolean);

  const origin = (originUrl, callback) => {
    // Non-browser tools (curl, Postman) send no Origin header - allow them
    if (!originUrl || origins.includes(originUrl)) return callback(null, true);
    return callback(new Error(`Origin ${originUrl} not allowed by CORS`));
  };

  return { origin, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], credentials: true };
};

app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: "100kb" }));

// Basic endpoints
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "New Testament Marathon API",
    endpoints: ["/api/auth", "/api/readings", "/api/progress", "/api/admin"],
  });
});

app.get("/health", (_req, res) => {
  res.json({ success: true, status: "ok", uptime: process.uptime() });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/readings", readingRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/admin", adminRoutes);

// 404 + central error handling (always last)
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

/** Start the HTTP server ONLY after MongoDB connects successfully. */
const start = async () => {
  try {
    await connectDB();

    const server = app.listen(PORT);
    await new Promise((resolve) => server.once("listening", resolve));

    console.log(`✅ API running on http://localhost:${server.address().port}`);
    return server;
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
};

// Run only when executed directly (tests import { app } instead)
if (require.main === module) {
  start();
}

module.exports = app;
module.exports.app = app;
module.exports.start = start;