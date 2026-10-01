require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const fieldsRoutes = require("./routes/fields");
const mentorsRoutes = require("./routes/mentors");
const bookingsRoutes = require("./routes/bookings");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// Booking creation is the one write endpoint with no auth at all, so it gets
// its own tighter limit to blunt slot-spamming/abuse.
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/bookings", (req, res, next) => {
  if (req.method === "POST") return bookingLimiter(req, res, next);
  next();
});

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/fields", fieldsRoutes);
app.use("/api/mentors", mentorsRoutes);
app.use("/api/bookings", bookingsRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found." }));

if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 4001;
  app.listen(PORT, () => console.log(`MentorSlot API running on port ${PORT}`));
}

module.exports = app;
