const express = require("express");
const pool = require("../db");
const asyncHandler = require("../lib/asyncHandler");
const { parseId, parseIntParam } = require("../lib/validation");
const {
  candidateSlots,
  BUFFER_MINUTES,
  DAYS_AHEAD,
  MAX_DAYS_AHEAD,
  ALLOWED_DURATIONS,
  DEFAULT_DURATION,
} = require("../lib/schedule");

const router = express.Router();

// List all mentors (flat, across every field).
router.get("/", asyncHandler(async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, title, bio, color, field_id, allowed_durations FROM mentors ORDER BY name ASC"
    );
    res.json({ mentors: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load mentors." });
  }
}));

// List a mentor's upcoming available start times for a given session length.
// Availability is computed live: business-hours grid minus whatever this
// mentor already has booked, rather than read off a pre-generated table —
// see lib/schedule.js for why.
router.get("/:id/slots", asyncHandler(async (req, res) => {
  const mentorId = parseId(req.params.id);
  if (mentorId === null) {
    return res.status(400).json({ error: "Invalid mentor id." });
  }

  const parsedDuration = parseIntParam(req.query.duration, { min: 1, max: 999, fallback: DEFAULT_DURATION });
  const duration = parsedDuration.value;
  if (parsedDuration.error || !ALLOWED_DURATIONS.includes(duration)) {
    return res.status(400).json({ error: `Session length must be one of: ${ALLOWED_DURATIONS.join(", ")} minutes.` });
  }

  const parsedDays = parseIntParam(req.query.days, { min: 1, max: MAX_DAYS_AHEAD, fallback: DAYS_AHEAD });
  if (parsedDays.error) {
    return res.status(400).json({ error: `days must be a whole number from 1 to ${MAX_DAYS_AHEAD}.` });
  }
  const days = parsedDays.value;

  try {
    const mentor = await pool.query(
      "SELECT id, name, title, color, field_id, allowed_durations FROM mentors WHERE id = $1",
      [mentorId]
    );
    if (mentor.rows.length === 0) {
      return res.status(404).json({ error: "Mentor not found." });
    }
    if (!mentor.rows[0].allowed_durations.includes(duration)) {
      return res.status(400).json({
        error: `This mentor doesn't offer ${duration}-minute sessions.`,
        allowed_durations: mentor.rows[0].allowed_durations,
      });
    }

    // Pull this mentor's existing bookings once, then filter the candidate
    // grid against them in memory — one round trip, no N+1 queries. Each
    // booking is padded by the buffer on both sides here: a candidate must be
    // at least BUFFER_MINUTES clear of it, matching the database's EXCLUDE
    // constraint (migrations/002), which is the actual guarantee on write.
    const now = new Date(Date.now());
    const bufferMs = BUFFER_MINUTES * 60 * 1000;
    const horizon = new Date(now);
    horizon.setUTCHours(0, 0, 0, 0);
    horizon.setUTCDate(horizon.getUTCDate() + days + 1);
    const existing = await pool.query(
      `SELECT start_time, end_time FROM bookings
       WHERE mentor_id = $1 AND end_time > $2 AND start_time < $3`,
      [mentorId, new Date(now.getTime() - bufferMs), new Date(horizon.getTime() + bufferMs)]
    );
    const booked = existing.rows.map((r) => [new Date(r.start_time).getTime(), new Date(r.end_time).getTime()]);

    const slots = [];
    for (const { start, end } of candidateSlots(now, days, duration)) {
      const startMs = start.getTime();
      const endMs = end.getTime();
      const blocked = booked.some(([bStart, bEnd]) => startMs < bEnd + bufferMs && endMs + bufferMs > bStart);
      if (blocked) continue;
      slots.push({ start_time: start.toISOString(), end_time: end.toISOString() });
    }

    res.json({ mentor: mentor.rows[0], duration, slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load slots." });
  }
}));

module.exports = router;
