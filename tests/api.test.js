const { test, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

// Ephemeral port + deterministic test date (development mode allows override)
process.env.PORT = "0";
process.env.NODE_ENV = "development";
process.env.TEST_DATE_OVERRIDE = "2026-10-04"; // today = Day 4 (متى 10-12)

require("dotenv").config();

// Dedicated test database - never touch the dev database
process.env.MONGODB_URI = process.env.MONGODB_URI.replace(
  /\/([^/?]+)(\?.*)?$/,
  "/new-testament-marathon-test$2"
);
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-only-secret";

const { app, start } = require("../server");

let baseUrl;
let httpServer;

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

before(async () => {
  httpServer = await start();
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  await mongoose.connection.dropDatabase();

  // Seed the 89 reading days (same code path as npm run seed:readings)
  const { syncScheduleToDatabase } = require("../services/marathonService");
  const result = await syncScheduleToDatabase();
  assert.strictEqual(result.total, 89);
  assert.strictEqual(result.chapters, 260);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  httpServer.close();
  httpServer.closeAllConnections();
});

let admin = {};
let caroline = {};
let hany = {};

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

test("GET /health responds ok", async () => {
  const r = await api("GET", "/health");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.success, true);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

test("register: new user with name/email/password/confirmPassword", async () => {
  const r = await api("POST", "/api/auth/register", {
    body: {
      name: "Caroline Magdy",
      email: "Caroline@Example.com", // uppercase on purpose
      password: "password123",
      confirmPassword: "password123",
    },
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.success, true);
  assert.strictEqual(typeof r.body.data.token, "string");
  assert.strictEqual(r.body.data.user.email, "caroline@example.com"); // lowercase
  assert.strictEqual(r.body.data.user.role, "user");
  assert.ok(!("password" in r.body.data.user));
  caroline = { token: r.body.data.token, user: r.body.data.user };
});

test("register: missing fields are rejected", async () => {
  const r = await api("POST", "/api/auth/register", {
    body: { name: "X", email: "x@example.com" }, // no password
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.success, false);
});

test("register: invalid email rejected", async () => {
  const r = await api("POST", "/api/auth/register", {
    body: { name: "Someone", email: "not-an-email", password: "password123", confirmPassword: "password123" },
  });
  assert.strictEqual(r.status, 400);
});

test("register: duplicate email rejected (case-insensitive)", async () => {
  const r = await api("POST", "/api/auth/register", {
    body: { name: "Caroline Again", email: "CAROLINE@example.com", password: "password123", confirmPassword: "password123" },
  });
  assert.strictEqual(r.status, 409);
});

test("register: short password rejected (min 8)", async () => {
  const r = await api("POST", "/api/auth/register", {
    body: { name: "Shorty", email: "short@example.com", password: "123456", confirmPassword: "123456" },
  });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.message, /8/);
});

test("register: password mismatch rejected", async () => {
  const r = await api("POST", "/api/auth/register", {
    body: { name: "Mismatch", email: "mismatch@example.com", password: "password123", confirmPassword: "password999" },
  });
  assert.strictEqual(r.status, 400);
});

test("register: role in body is ignored (cannot self-promote to admin)", async () => {
  const r = await api("POST", "/api/auth/register", {
    body: { name: "Evil", email: "evil@example.com", password: "password123", confirmPassword: "password123", role: "admin" },
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.data.user.role, "user");
});

test("login: success records a LoginEvent + lastLoginAt", async () => {
  const r = await api("POST", "/api/auth/login", {
    body: { email: "caroline@example.com", password: "password123" },
  });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.data.token);
  assert.ok(r.body.data.user.lastLoginAt);
  assert.ok(!("password" in r.body.data.user));
  caroline.token = r.body.data.token;

  const LoginEvent = require("../models/LoginEvent");
  const events = await LoginEvent.find({ userId: r.body.data.user._id });
  assert.strictEqual(events.length, 1);
});

test("login: wrong password -> generic error (no enumeration)", async () => {
  const wrong = await api("POST", "/api/auth/login", {
    body: { email: "caroline@example.com", password: "wrong-password" },
  });
  assert.strictEqual(wrong.status, 401);
  assert.strictEqual(wrong.body.message, "Invalid email or password");

  const unknown = await api("POST", "/api/auth/login", {
    body: { email: "ghost@example.com", password: "whatever123" },
  });
  assert.strictEqual(unknown.status, 401);
  assert.strictEqual(unknown.body.message, "Invalid email or password");
});

test("auth/me: returns current user without password; rejects bad tokens", async () => {
  const me = await api("GET", "/api/auth/me", { token: caroline.token });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.data.email, "caroline@example.com");
  assert.ok(!("password" in me.body.data));

  const noToken = await api("GET", "/api/auth/me");
  assert.strictEqual(noToken.status, 401);

  const badToken = await api("GET", "/api/auth/me", { token: "not.a.jwt" });
  assert.strictEqual(badToken.status, 401);
});

// ---------------------------------------------------------------------------
// Readings before any submission (today = Day 4)
// ---------------------------------------------------------------------------

test("readings/today GET: Day 4 payload with progress", async () => {
  const r = await api("GET", "/api/readings/today", { token: caroline.token });
  assert.strictEqual(r.status, 200);
  const d = r.body.data;
  assert.strictEqual(d.marathonState, "active");
  assert.strictEqual(d.reading.dayNumber, 4);
  assert.strictEqual(d.reading.date, "2026-10-04");
  assert.strictEqual(d.reading.title, "متى 10-12");
  assert.strictEqual(d.todayTarget, 3);
  assert.strictEqual(d.todayStatus, "not_registered");
  assert.strictEqual(d.todayReflection, "");
  assert.strictEqual(d.progress.chaptersRead, 0);
  assert.strictEqual(d.progress.totalChapters, 260);
  assert.strictEqual(d.progress.currentDay, 4);
});

test("readings/timeline: 89 days, day 4 highlighted, future locked", async () => {
  const r = await api("GET", "/api/readings/timeline", { token: caroline.token });
  assert.strictEqual(r.status, 200);
  const days = r.body.data.days;
  assert.strictEqual(days.length, 89);

  const day4 = days.find((d) => d.dayNumber === 4);
  assert.strictEqual(day4.isToday, true);
  assert.strictEqual(day4.locked, false);

  const day5 = days.find((d) => d.dayNumber === 5);
  assert.strictEqual(day5.isFuture, true);
  assert.strictEqual(day5.locked, true);

  const day1 = days.find((d) => d.dayNumber === 1);
  assert.strictEqual(day1.isPast, true);
  assert.strictEqual(day1.status, "not_registered");
});

test("readings/history/:dayNumber: future day is locked (403)", async () => {
  const r = await api("GET", "/api/readings/history/10", { token: caroline.token });
  assert.strictEqual(r.status, 403);
});

// ---------------------------------------------------------------------------
// Submitting today's reading
// ---------------------------------------------------------------------------

test("submit: empty/missing reflection rejected", async () => {
  const empty = await api("POST", "/api/readings/today", {
    token: caroline.token,
    body: { chaptersRead: 3, reflection: "   " },
  });
  assert.strictEqual(empty.status, 400);
  assert.match(empty.body.message, /reflection/i);

  const missing = await api("POST", "/api/readings/today", {
    token: caroline.token,
    body: { chaptersRead: 3 },
  });
  assert.strictEqual(missing.status, 400);
});

test("submit: invalid chaptersRead rejected (0, 2.5, 11)", async () => {
  for (const chaptersRead of [0, 2.5, 11, "three"]) {
    const r = await api("POST", "/api/readings/today", {
      token: caroline.token,
      body: { chaptersRead, reflection: "ok" },
    });
    assert.strictEqual(r.status, 400, `expected 400 for chaptersRead=${chaptersRead}`);
  }
});

test("submit: first submission 3/3 -> completed", async () => {
  const r = await api("POST", "/api/readings/today", {
    token: caroline.token,
    body: { chaptersRead: 3, reflection: "قراءة النهارده لمست قلبي جدًا" },
  });
  assert.strictEqual(r.status, 201);
  const d = r.body.data;
  assert.strictEqual(d.dayNumber, 4);
  assert.strictEqual(d.assignedChapters, 3);
  assert.strictEqual(d.chaptersRead, 3);
  assert.strictEqual(d.status, "completed");
  assert.ok(d.savedAt);
  assert.ok(d.completedAt);
});

test("submit: duplicate submission same day rejected (409)", async () => {
  const r = await api("POST", "/api/readings/today", {
    token: caroline.token,
    body: { chaptersRead: 2, reflection: "try again" },
  });
  assert.strictEqual(r.status, 409);

  // And the original record was not modified
  const today = await api("GET", "/api/readings/today", { token: caroline.token });
  assert.strictEqual(today.body.data.todayReflection, "قراءة النهارده لمست قلبي جدًا");
});

test("partial reading: 1/3 -> partial for a second user", async () => {
  const reg = await api("POST", "/api/auth/register", {
    body: { name: "Hany", email: "hany@example.com", password: "password123", confirmPassword: "password123" },
  });
  hany = { token: reg.body.data.token, user: reg.body.data.user };

  const one = await api("POST", "/api/readings/today", {
    token: hany.token,
    body: { chaptersRead: 1, reflection: "بدأت القراءة" },
  });
  assert.strictEqual(one.status, 201);
  assert.strictEqual(one.body.data.status, "partial");
  assert.strictEqual(one.body.data.completedAt, null);

  // A second user cannot submit the same day twice either
  const again = await api("POST", "/api/readings/today", {
    token: hany.token,
    body: { chaptersRead: 3, reflection: "خلاصت" },
  });
  assert.strictEqual(again.status, 409);

  // Login again to refresh the token/user (also feeds LoginEvent stats)
  const loginAgain = await api("POST", "/api/auth/login", {
    body: { email: "hany@example.com", password: "password123" },
  });
  hany.token = loginAgain.body.data.token;
});

// ---------------------------------------------------------------------------
// History + progress
// ---------------------------------------------------------------------------

test("history: shows submitted records with schedule info", async () => {
  const r = await api("GET", "/api/readings/history", { token: caroline.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.history.length, 1);
  const row = r.body.data.history[0];
  assert.strictEqual(row.dayNumber, 4);
  assert.strictEqual(row.date, "2026-10-04");
  assert.strictEqual(row.title, "متى 10-12");
  assert.strictEqual(row.status, "completed");
  assert.ok(row.reflection);
  assert.ok(row.savedAt);
});

test("history/:dayNumber: past day without record -> not_registered", async () => {
  const r = await api("GET", "/api/readings/history/2", { token: caroline.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.day.dayNumber, 2);
  assert.strictEqual(r.body.data.record, null);
  assert.strictEqual(r.body.data.status, "not_registered");
});

test("history/:dayNumber: day with record returns it", async () => {
  const r = await api("GET", "/api/readings/history/4", { token: caroline.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.record.chaptersRead, 3);
  assert.strictEqual(r.body.data.record.reflection, "قراءة النهارده لمست قلبي جدًا");
});

test("progress/me: 3/260 = 1.15%, commitment counting", async () => {
  const r = await api("GET", "/api/readings/progress/me", { token: caroline.token });
  assert.strictEqual(r.status, 200);
  const p = r.body.data;
  assert.strictEqual(p.totalChapters, 260);
  assert.strictEqual(p.chaptersRead, 3);
  assert.strictEqual(p.chaptersRemaining, 257);
  assert.strictEqual(p.journeyPercentage, 1.15);
  assert.strictEqual(p.currentDay, 4);
  assert.strictEqual(p.elapsedDays, 4);
  assert.strictEqual(p.completedDays, 1);
  assert.strictEqual(p.partialDays, 0);
  assert.strictEqual(p.missedDays, 3);
  assert.strictEqual(p.commitmentPercentage, 25); // 1 completed / 4 elapsed
});

test("progress/books: متى 3/28", async () => {
  const r = await api("GET", "/api/progress/books", { token: caroline.token });
  assert.strictEqual(r.status, 200);
  const matthew = r.body.data.books.find((b) => b.book === "متى");
  assert.strictEqual(matthew.chaptersRead, 3);
  assert.strictEqual(matthew.totalChapters, 28);
  assert.strictEqual(matthew.percentage, 10.71);
  const revelation = r.body.data.books.find((b) => b.book === "الرؤيا");
  assert.strictEqual(revelation.chaptersRead, 0);
});

test("progress/next: Day 5 preview (متى 13-15)", async () => {
  const r = await api("GET", "/api/progress/next", { token: caroline.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.nextDay.dayNumber, 5);
  assert.strictEqual(r.body.data.nextDay.title, "متى 13-15");
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

before(async () => {
  // Seed admin exactly like the seed script does
  const User = require("../models/User");
  const hashed = await User.hashPassword("admin-password-123");
  await User.findOneAndUpdate(
    { email: "admin@marathon.local" },
    { name: "Marathon Admin", email: "admin@marathon.local", password: hashed, role: "admin" },
    { upsert: true }
  );
  const login = await api("POST", "/api/auth/login", {
    body: { email: "admin@marathon.local", password: "admin-password-123" },
  });
  assert.strictEqual(login.status, 200);
  admin = { token: login.body.data.token, user: login.body.data.user };
});

test("admin: normal user gets 403, anonymous gets 401", async () => {
  const asUser = await api("GET", "/api/admin/dashboard", { token: caroline.token });
  assert.strictEqual(asUser.status, 403);

  const anon = await api("GET", "/api/admin/dashboard");
  assert.strictEqual(anon.status, 401);
});

test("admin/dashboard: live stats for today (day 4)", async () => {
  const r = await api("GET", "/api/admin/dashboard", { token: admin.token });
  assert.strictEqual(r.status, 200);
  const d = r.body.data;
  assert.strictEqual(d.date, "2026-10-04");
  assert.strictEqual(d.marathon.currentDay, 4);
  assert.strictEqual(d.marathon.totalDays, 89);
  assert.strictEqual(d.marathon.todayTarget, 3);
  assert.strictEqual(d.stats.totalUsers, 3); // caroline + hany + evil (admin excluded)
  assert.strictEqual(d.stats.completed, 1); // caroline 3/3
  assert.strictEqual(d.stats.partial, 1); // hany 1/3
  assert.strictEqual(d.stats.notRegistered, 1); // evil never submitted
  assert.strictEqual(d.community.totalUsers, 3);
  assert.strictEqual(d.community.totalChaptersRead, 4); // 3 + 1
  assert.strictEqual(d.community.totalPossibleChapters, 780); // 3 x 260
  assert.ok(d.community.communityPercentage > 0 && d.community.communityPercentage < 1);
});

test("admin/dashboard: user rows carry today + overall + login + reflection", async () => {
  // Logins happen at real wall-clock time, so seed one inside the selected
  // Cairo day (2026-10-04 09:00 Cairo == 06:00 UTC) to verify the query logic.
  const LoginEvent = require("../models/LoginEvent");
  await LoginEvent.create({
    userId: caroline.user._id,
    loginAt: new Date("2026-10-04T06:00:00Z"),
  });

  const r = await api("GET", "/api/admin/dashboard", { token: admin.token });
  const carolineRow = r.body.data.users.find((u) => u.email === "caroline@example.com");
  const hanyRow = r.body.data.users.find((u) => u.email === "hany@example.com");

  assert.ok(carolineRow);
  assert.strictEqual(carolineRow.today.status, "completed");
  assert.strictEqual(carolineRow.today.chaptersRead, 3);
  assert.strictEqual(carolineRow.today.reflection, "قراءة النهارده لمست قلبي جدًا");
  assert.ok(carolineRow.today.savedAt);
  assert.strictEqual(carolineRow.overall.chaptersRead, 3);
  assert.strictEqual(carolineRow.overall.remaining, 257);
  assert.ok(carolineRow.loginAt, "first Cairo-day login should be recorded");
  assert.ok(carolineRow.lastLoginAt);

  // hany has no login event inside the selected day
  assert.strictEqual(hanyRow.loginAt, null);
});

test("admin/dashboard?date=: calendar filtering for a previous day", async () => {
  const r = await api("GET", "/api/admin/dashboard?date=2026-10-01", { token: admin.token });
  assert.strictEqual(r.status, 200);
  const d = r.body.data;
  assert.strictEqual(d.isToday, false);
  assert.strictEqual(d.date, "2026-10-01");
  assert.strictEqual(d.selectedDayReading, "متى 1-3");
  assert.strictEqual(d.dayNumber, 1);
  // Nobody submitted on day 1 (submissions only happen for "today")
  assert.strictEqual(d.stats.completed, 0);
  assert.strictEqual(d.stats.notRegistered, 3);
});

test("admin/dashboard: invalid date rejected", async () => {
  const r = await api("GET", "/api/admin/dashboard?date=not-a-date", { token: admin.token });
  assert.strictEqual(r.status, 400);
});

test("admin/users: search + status filter + pagination", async () => {
  const all = await api("GET", "/api/admin/users?page=1&limit=1", { token: admin.token });
  assert.strictEqual(all.status, 200);
  assert.strictEqual(all.body.data.totalUsers, 3);
  assert.strictEqual(all.body.data.users.length, 1);

  const search = await api("GET", "/api/admin/users?search=caroline", { token: admin.token });
  assert.strictEqual(search.body.data.totalUsers, 1);
  assert.strictEqual(search.body.data.users[0].email, "caroline@example.com");

  const completed = await api("GET", "/api/admin/users?status=completed", { token: admin.token });
  assert.strictEqual(completed.body.data.returned, 1);

  const partial = await api("GET", "/api/admin/users?status=partial", { token: admin.token });
  assert.strictEqual(partial.body.data.returned, 1);
});

test("admin/users/:id: details with progress + full history", async () => {
  const list = await api("GET", "/api/admin/users?search=caroline", { token: admin.token });
  const id = list.body.data.users[0].id;

  const r = await api("GET", `/api/admin/users/${id}`, { token: admin.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.user.email, "caroline@example.com");
  assert.ok(!("password" in r.body.data.user));
  assert.strictEqual(r.body.data.progress.chaptersRead, 3);
  assert.strictEqual(r.body.data.history.length, 1);
  assert.strictEqual(r.body.data.history[0].dayNumber, 4);

  const missing = await api("GET", "/api/admin/users/000000000000000000000000", { token: admin.token });
  assert.strictEqual(missing.status, 404);
});

test("admin/readings?date=: per-user reading rows", async () => {
  const r = await api("GET", "/api/admin/readings?date=2026-10-04", { token: admin.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.date, "2026-10-04");
  assert.strictEqual(r.body.data.todayReading, "متى 10-12");
  assert.strictEqual(r.body.data.readings.length, 3);
  const statuses = r.body.data.readings.map((row) => row.today.status).sort();
  assert.deepStrictEqual(statuses, ["completed", "not_registered", "partial"]);
});

test("admin/progress: community + per-user progress", async () => {
  const r = await api("GET", "/api/admin/progress", { token: admin.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.community.totalChaptersRead, 4);
  assert.strictEqual(r.body.data.users.length, 3);
  assert.ok(r.body.data.users.every((u) => u.progress.totalChapters === 260));
});

test("admin/calendar: 89 days with per-day counts", async () => {
  const r = await api("GET", "/api/admin/calendar", { token: admin.token });
  assert.strictEqual(r.status, 200);
  const days = r.body.data.days;
  assert.strictEqual(days.length, 89);
  const day4 = days.find((d) => d.dayNumber === 4);
  assert.strictEqual(day4.completed, 1);
  const day3 = days.find((d) => d.dayNumber === 3);
  assert.strictEqual(day3.completed, 0);
});

// ---------------------------------------------------------------------------
// Edge dates (rerun the request cycle with different TEST_DATE_OVERRIDE)
// ---------------------------------------------------------------------------

test("edge: before October 1 (2026-09-25) marathon has not started", async () => {
  process.env.TEST_DATE_OVERRIDE = "2026-09-25";

  const today = await api("GET", "/api/readings/today", { token: caroline.token });
  assert.strictEqual(today.status, 200);
  assert.strictEqual(today.body.data.marathonState, "not_started");
  assert.strictEqual(today.body.data.reading, null);

  const submit = await api("POST", "/api/readings/today", {
    token: hany.token,
    body: { chaptersRead: 2, reflection: "too early" },
  });
  assert.strictEqual(submit.status, 400);
  assert.match(submit.body.message, /not started/i);

  const next = await api("GET", "/api/progress/next", { token: caroline.token });
  assert.strictEqual(next.body.data.nextDay.dayNumber, 1); // Day 1 is next

  process.env.TEST_DATE_OVERRIDE = "2026-10-04";
});

test("edge: after December 28 (2026-12-29) marathon is completed", async () => {
  process.env.TEST_DATE_OVERRIDE = "2026-12-29";

  const today = await api("GET", "/api/readings/today", { token: caroline.token });
  assert.strictEqual(today.status, 200);
  assert.strictEqual(today.body.data.marathonState, "completed");

  const submit = await api("POST", "/api/readings/today", {
    token: hany.token,
    body: { chaptersRead: 2, reflection: "too late" },
  });
  assert.strictEqual(submit.status, 400);
  assert.match(submit.body.message, /finished/i);

  const next = await api("GET", "/api/progress/next", { token: caroline.token });
  assert.strictEqual(next.body.data.marathonState, "completed");
  assert.strictEqual(next.body.data.nextDay, null);

  process.env.TEST_DATE_OVERRIDE = "2026-10-04";
});

test("edge: Day 89 (2026-12-28) is the last valid day", async () => {
  process.env.TEST_DATE_OVERRIDE = "2026-12-28";

  const today = await api("GET", "/api/readings/today", { token: caroline.token });
  assert.strictEqual(today.status, 200);
  assert.strictEqual(today.body.data.reading.dayNumber, 89);
  // Day 89 is one of the 7 two-chapter days: Revelation 21-22 (the final chapters)
  assert.strictEqual(today.body.data.reading.title, "الرؤيا 21-22");
  assert.strictEqual(today.body.data.todayTarget, 2);

  process.env.TEST_DATE_OVERRIDE = "2026-10-04";
});

test("Day 50 schedule spot-check from the API timeline", async () => {
  const r = await api("GET", "/api/readings/timeline", { token: caroline.token });
  const day50 = r.body.data.days.find((d) => d.dayNumber === 50);
  assert.ok(day50);
  assert.strictEqual(day50.date, "2026-11-19");
  assert.ok(day50.title.length > 0);
  assert.strictEqual(day50.chapters >= 2 && day50.chapters <= 3, true);
});
