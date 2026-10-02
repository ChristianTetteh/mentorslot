const express = require("express");
const pool = require("../db");
const asyncHandler = require("../lib/asyncHandler");
const { validateBookingInput, normalizeEmail } = require("../lib/validation");
const mailer = require("../lib/mailer");
const { createManageToken } = require("../lib/manageToken");
const { confirmationEmail, linksEmail, manageLink } = require("../lib/emails");
const { runInBackground } = require("../lib/background");
const { lookupEmailLimiter, confirmEmailLimiter } = require("../lib/mailLimits");

const router = express.Router({ caseSensitive: true, strict: true });

// Book a session. This is the core "prevent double-booking" guarantee, and it
// now covers *overlap*, not just "the exact same slot" — a 60-minute booking
// at 9:00 and a 30-minute booking at 9:15 collide just as surely as two
// identical 9:00 bookings would.
//
// That's enforced by a database EXCLUDE constraint (migrations/002_buffer_constraint.sql) on
// (mentor_id, range of start_time .. end_time + 15 minutes): Postgres refuses
// to let a row into the table if it overlaps, or sits within the 15-minute
// buffer of, an existing row for the same mentor, atomically, the same way a UNIQUE constraint would. No manual transaction
// or row-locking dance is needed in this handler for correctness — a plain
// INSERT either succeeds or raises error code 23P01 ("exclusion_violation"),
// which becomes a 409 below.
router.post("/", asyncHandler(async (req, res) => {
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

    const created = booking.rows[0];
    const mentorRow = mentor.rows[0];

    // The private manage link: shown to the booker once, here, and emailed.
    // It is recomputed from the booking id and the server secret whenever it
    // is needed again, so nothing about it is stored.
    const manageToken = createManageToken(created.id);
    const link = manageLink(created.id);
    // A confirmation goes to whatever address was typed, so cap how many one
    // address can receive per hour (the booking itself is never affected).
    const attemptEmail = link !== null && confirmEmailLimiter.take(email);
    const emailed = attemptEmail && mailer.isConfigured();

    res.status(201).json({
      manage_token: manageToken,
      emailed,
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

    // After the response, and never able to fail the booking: sendMail
    // resolves rather than throws, and runInBackground catches anything else.
    if (attemptEmail) {
      runInBackground(() => {
        const message = confirmationEmail({
          booking: { start_time: created.start_time, end_time: created.end_time, duration_minutes: created.duration_minutes },
          mentor: mentorRow,
          link,
        });
        return mailer.sendMail({ to: email, ...message });
      });
    }
  } catch (err) {
    if (err.code === "23P01") {
      // Exclusion-constraint violation — this time range overlaps (or is
      // within the buffer of) a booking that already exists for this mentor.
      return res
        .status(409)
        .json({ error: "That time overlaps or is too close to an existing booking. Please pick another." });
    }
    console.error(err);
    res.status(500).json({ error: "Could not create the booking." });
  }
}));

const LOOKUP_MESSAGE = "If we have upcoming bookings for that email, we've sent the links.";
const MAX_LINKS_PER_EMAIL = 25;

// "Email me my links". The reply is identical whether or not the address has
// bookings, so this can't be used to find out who has booked. The lookup and
// the send happen after the response is out, so timing doesn't differ either.
// (Whether email is configured at all is server config, not account data.)
router.post("/lookup", asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  if (!email) {
    return res.status(400).json({ error: "A valid email is required." });
  }
  if (!mailer.isConfigured()) {
    return res.status(503).json({
      error: "Email isn't set up on this server yet, so links can't be sent. Use the private link shown when you booked.",
    });
  }

  // Over the per-address budget: say exactly what we always say, send nothing.
  const allowed = lookupEmailLimiter.take(email);
  res.json({ message: LOOKUP_MESSAGE });
  if (!allowed) return;

  runInBackground(async () => {
    const result = await pool.query(
      `SELECT b.id, b.start_time, b.end_time, b.duration_minutes, m.name AS mentor_name, m.title AS mentor_title
       FROM bookings b
       JOIN mentors m ON m.id = b.mentor_id
       WHERE b.mentee_email = $1 AND b.start_time > now()
       ORDER BY b.start_time ASC
       LIMIT ${MAX_LINKS_PER_EMAIL}`,
      [email]
    );
    if (result.rows.length === 0) return;

    const items = [];
    for (const row of result.rows) {
      const link = manageLink(row.id);
      if (!link) {
        console.error("Cannot build manage links: no frontend origin is configured.");
        return;
      }
      items.push({
        booking: { start_time: row.start_time, end_time: row.end_time, duration_minutes: row.duration_minutes },
        mentor: { name: row.mentor_name, title: row.mentor_title },
        link,
      });
    }
    await mailer.sendMail({ to: email, ...linksEmail(items) });
  });
}));

module.exports = router;
module.exports.LOOKUP_MESSAGE = LOOKUP_MESSAGE;
