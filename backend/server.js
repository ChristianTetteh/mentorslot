require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const fieldsRoutes = require("./routes/fields");
const mentorsRoutes = require("./routes/mentors");
const bookingsRoutes = require("./routes/bookings");
const manageRoutes = require("./routes/manage");
const { resolveCorsOrigin, assertProductionConfig } = require("./lib/config");

// Refuse to boot in production without what private links depend on
// (MANAGE_SECRET, a usable frontend origin when email is on).
assertProductionConfig();

const app = express();

// "/api/bookings/LOOKUP" or "/lookup/" must not slip past the per-route limiters.
app.set("case sensitive routing", true);
app.set("strict routing", true); // "/lookup/" is not "/lookup", so no limiter bypass by path variant

// Render (and most hosts) put exactly one reverse proxy in front of the app.
// Without this, req.ip is the proxy's address, so every visitor would share
// one rate-limit bucket (and X-Forwarded-For would be ignored).
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: resolveCorsOrigin() }));
app.use(express.json());

// Booking creation is the one write endpoint with no auth at all, so it gets
// its own tighter limit to blunt slot-spamming/abuse.
const jsonLimit = (windowMs, max) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  });
const bookingLimiter = jsonLimit(15 * 60 * 1000, 30);
// "Email me my links" sends mail, so it is much tighter: 10 per hour per IP
// (a per-address limit of 5 per hour sits in the route, and is silent).
const lookupLimiter = jsonLimit(60 * 60 * 1000, 10);
// Manage links are unguessable (256-bit MAC), so this only has to make
// scripted guessing pointless; it is generous for real people sharing an IP.
const manageLimiter = jsonLimit(15 * 60 * 1000, 60);

app.use("/api/bookings", (req, res, next) => {
  if (req.method !== "POST") return next();
  if (req.path === "/lookup") return lookupLimiter(req, res, next);
  if (req.path === "/") return bookingLimiter(req, res, next);
  next();
});
app.use("/api/manage", manageLimiter);

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/fields", fieldsRoutes);
app.use("/api/mentors", mentorsRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/manage", manageRoutes);

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
