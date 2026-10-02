const express = require("express");
const pool = require("../db");
const asyncHandler = require("../lib/asyncHandler");
const { parseId, parseIntParam } = require("../lib/validation");
const { businessDays, gridStartsForDay, DAYS_AHEAD, MAX_DAYS_AHEAD, ALLOWED_DURATIONS, DEFAULT_DURATION } = require("../lib/schedule");

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
    // grid against them in memory — one round trip, no N+1 queries. The
    // actual no-overlap guarantee lives in the database's EXCLUDE constraint
    // on write (schema.sql); this is just read-side convenience, so a bug
    // here could at worst offer a slot that then 409s on booking, never the
    // reverse.
    const existing = await pool.query(
      `SELECT start_time, end_time FROM bookings
       WHERE mentor_id = $1 AND end_time > now()
         AND start_time < (CURRENT_DATE + (($2::int + 1) || ' days')::interval)`,
      [mentorId, days]
    );
    const booked = existing.rows.map((r) => [new Date(r.start_time).getTime(), new Date(r.end_time).getTime()]);

    const now = new Date();
    const durationMs = duration * 60 * 1000;
    const slots = [];
    for (const day of businessDays(now, days)) {
      for (const { start, boundary } of gridStartsForDay(day, duration)) {
        if (start <= now) continue;
        const end = new Date(start.getTime() + durationMs);
        if (end > boundary) continue; // defensive — gridStartsForDay already keeps candidates within the block
        const startMs = start.getTime();
        const endMs = end.getTime();
        const overlaps = booked.some(([bStart, bEnd]) => startMs < bEnd && endMs > bStart);
        if (overlaps) continue;
        slots.push({ start_time: start.toISOString(), end_time: end.toISOString() });
      }
    }

    res.json({ mentor: mentor.rows[0], duration, slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load slots." });
  }
}));

module.exports = router;
