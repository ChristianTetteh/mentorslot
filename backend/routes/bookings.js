const express = require("express");
const pool = require("../db");
const { validateBookingInput } = require("../lib/validation");

const router = express.Router();

// Book a session. This is the core "prevent double-booking" guarantee, and it
// now covers *overlap*, not just "the exact same slot" — a 60-minute booking
// at 9:00 and a 30-minute booking at 9:15 collide just as surely as two
// identical 9:00 bookings would.
//
// That's enforced by a database EXCLUDE constraint (schema.sql) on
// (mentor_id, tstzrange(start_time, end_time)): Postgres refuses to let a row
// into the table if it overlaps an existing row for the same mentor,
// atomically, the same way a UNIQUE constraint would. No manual transaction
// or row-locking dance is needed in this handler for correctness — a plain
// INSERT either succeeds or raises error code 23P01 ("exclusion_violation"),
// which becomes a 409 below.
router.post("/", async (req, res) => {
  const { mentorId, start, end, durationMinutes, name, email, error } = validateBookingInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const mentor = await pool.query(
      "SELECT id, name, title, allowed_durations FROM mentors WHERE id = $1",
      [mentorId]
    );
    if (mentor.rows.length === 0) {
      return res.status(404).json({ error: "Mentor not found." });
    }
    if (!mentor.rows[0].allowed_durations.includes(durationMinutes)) {
      return res.status(400).json({ error: `This mentor doesn't offer ${durationMinutes}-minute sessions.` });
    }

    const booking = await pool.query(
      `INSERT INTO bookings (mentor_id, mentee_name, mentee_email, start_time, end_time, duration_minutes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, start_time, end_time, duration_minutes, created_at`,
      [mentorId, name, email, start.toISOString(), end.toISOString(), durationMinutes]
    );

    res.status(201).json({
      booking: {
        id: booking.rows[0].id,
        mentor_id: mentorId,
        mentor_name: mentor.rows[0].name,
        mentor_title: mentor.rows[0].title,
        start_time: booking.rows[0].start_time,
        end_time: booking.rows[0].end_time,
        duration_minutes: booking.rows[0].duration_minutes,
        mentee_name: name,
        mentee_email: email,
        created_at: booking.rows[0].created_at,
      },
    });
  } catch (err) {
    if (err.code === "23P01") {
      // Exclusion-constraint violation — this time range overlaps a booking
      // that already exists for this mentor.
      return res
        .status(409)
        .json({ error: "That time overlaps an existing booking. Please pick another." });
    }
    console.error(err);
    res.status(500).json({ error: "Could not create the booking." });
  }
});

// Look up bookings by email (no accounts, so email is the lookup key).
router.get("/", async (req, res) => {
  const email = (req.query.email || "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "An email is required to look up bookings." });
  }
  try {
    const result = await pool.query(
      `SELECT b.id, b.mentee_name, b.mentee_email, b.start_time, b.end_time, b.duration_minutes, b.created_at,
              m.id AS mentor_id, m.name AS mentor_name, m.title AS mentor_title, m.color
       FROM bookings b
       JOIN mentors m ON m.id = b.mentor_id
       WHERE b.mentee_email = $1
       ORDER BY b.start_time ASC`,
      [email]
    );
    res.json({ bookings: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load bookings." });
  }
});

// Cancel a booking (must supply the same email it was booked with — the only
// "ownership" check available without a login system). Freeing the time slot
// needs no extra step now: availability is computed live from whatever rows
// remain in `bookings`, so deleting this row is the whole operation.
router.delete("/:id", async (req, res) => {
  const bookingId = Number(req.params.id);
  const email = (req.body.email || "").trim().toLowerCase();
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking id." });
  }
  if (!email) {
    return res.status(400).json({ error: "Email is required to cancel a booking." });
  }

  try {
    const existing = await pool.query("SELECT mentee_email FROM bookings WHERE id = $1", [bookingId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found." });
    }
    if (existing.rows[0].mentee_email !== email) {
      return res.status(403).json({ error: "That email doesn't match this booking." });
    }

    await pool.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
    res.json({ cancelled: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not cancel the booking." });
  }
});

module.exports = router;
