require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const fieldsRoutes = require("./routes/fields");
const mentorsRoutes = require("./routes/mentors");
const bookingsRoutes = require("./routes/bookings");
const { resolveCorsOrigin } = require("./lib/config");

const app = express();

// Render (and most hosts) put exactly one reverse proxy in front of the app.
// Without this, req.ip is the proxy's address, so every visitor would share
// one rate-limit bucket (and X-Forwarded-For would be ignored).
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: resolveCorsOrigin() }));
app.use(express.json());

// Booking creation is the one write endpoint with no auth at all, so it gets
// its own tighter limit to blunt slot-spamming/abuse. Looking up or cancelling
// by email is guessable too, so those share a separate limit.
const limiterOptions = {
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
};
const bookingLimiter = rateLimit(limiterOptions);
const lookupLimiter = rateLimit(limiterOptions);
app.use("/api/bookings", (req, res, next) => {
  if (req.method === "POST") return bookingLimiter(req, res, next);
  if (req.method === "GET" || req.method === "DELETE") return lookupLimiter(req, res, next);
  next();
});

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/fields", fieldsRoutes);
app.use("/api/mentors", mentorsRoutes);
app.use("/api/bookings", bookingsRoutes);

// Unknown routes (including unknown /api/... paths) get JSON, not Express's HTML 404 page.
app.use((req, res) => res.status(404).json({ error: "Not found." }));

// Last-resort error handler: always JSON, never a stack trace or HTML.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 4001;
  app.listen(PORT, () => console.log(`MentorSlot API running on port ${PORT}`));
}

module.exports = app;
