require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const {
  notFoundHandler,
  errorHandler,
} = require("./middleware/errorMiddleware");

const authRoutes = require("./routes/authRoutes");
const readingRoutes = require("./routes/readingRoutes");
const progressRoutes = require("./routes/progressRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

/* =========================================================
   CORS
========================================================= */

const buildCorsOptions = () => {
  const raw = (process.env.CLIENT_URL || "").trim();

  // Allow all origins when CLIENT_URL is empty
  // Useful for local development / Postman
  if (!raw) {
    return { origin: true };
  }

  const origins = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const origin = (originUrl, callback) => {
    // Postman / curl usually don't send Origin
    if (!originUrl || origins.includes(originUrl)) {
      return callback(null, true);
    }

    return callback(
      new Error(`Origin ${originUrl} not allowed by CORS`)
    );
  };

  return {
    origin,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    credentials: true,
  };
};

app.use(cors(buildCorsOptions()));

app.use(express.json({ limit: "100kb" }));

/* =========================================================
   MongoDB Connection
========================================================= */

let dbConnectionPromise = null;

const ensureDBConnection = async () => {
  // Already connected
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Connection is already being established
  if (dbConnectionPromise) {
    return dbConnectionPromise;
  }

  console.log("🔌 Connecting to MongoDB...");

  dbConnectionPromise = connectDB()
    .then((conn) => {
      console.log("✅ MongoDB connection ready");
      return conn;
    })
    .catch((err) => {
      console.error("❌ MongoDB connection failed:", err.message);

      // Allow the next request to retry
      dbConnectionPromise = null;

      throw err;
    });

  return dbConnectionPromise;
};

/* =========================================================
   Basic Endpoints
========================================================= */

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "New Testament Marathon API",
    endpoints: [
      "/api/auth",
      "/api/readings",
      "/api/progress",
      "/api/admin",
    ],
  });
});

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    uptime: process.uptime(),
  });
});

/* =========================================================
   IMPORTANT:
   Connect to MongoDB BEFORE API routes
========================================================= */

app.use(async (req, res, next) => {
  try {
    await ensureDBConnection();
    next();
  } catch (err) {
    console.error(
      "❌ Database unavailable for request:",
      req.method,
      req.originalUrl
    );

    next(err);
  }
});

/* =========================================================
   API Routes
========================================================= */

app.use("/api/auth", authRoutes);

app.use("/api/readings", readingRoutes);

app.use("/api/progress", progressRoutes);

app.use("/api/admin", adminRoutes);

/* =========================================================
   404 + Error Handling
   These MUST remain last
========================================================= */

app.use(notFoundHandler);

app.use(errorHandler);

/* =========================================================
   Local Development
========================================================= */

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await ensureDBConnection();

    const server = app.listen(PORT);

    await new Promise((resolve) => {
      server.once("listening", resolve);
    });

    console.log(
      `✅ API running on http://localhost:${server.address().port}`
    );

    return server;
  } catch (err) {
    console.error(
      "❌ Failed to start server:",
      err.message
    );

    process.exit(1);
  }
};

/* =========================================================
   Start local server only
========================================================= */

if (require.main === module) {
  start();
}

/* =========================================================
   Vercel / Serverless
========================================================= */

module.exports = app;