const express = require("express");
const pool = require("../db");
const asyncHandler = require("../lib/asyncHandler");
const { verifyManageToken } = require("../lib/manageToken");

const router = express.Router({ caseSensitive: true, strict: true });

// Every failure to identify a booking says exactly this: a forged, tampered
// or malformed token, an unknown booking and an already-cancelled one are
// indistinguishable to the caller.
const NOT_FOUND = { error: "Booking not found." };

// The token travels in the POST body, never the URL or query string, so it
// can't end up in access logs, browser history or Referer headers.
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Resolves the request's token to a booking id. Sends the response itself and
// returns null when the token is absent (400) or not genuine (404); in both
// cases the database has not been touched.
function bookingIdFromRequest(req, res) {
  const token = req.body && typeof req.body === "object" ? req.body.token : undefined;
  if (typeof token !== "string" || token.length === 0) {
    res.status(400).json({ error: "A booking link is required." });
    return null;
  }
  const bookingId = verifyManageToken(token);
  if (bookingId === null) {
    res.status(404).json(NOT_FOUND);
    return null;
  }
  return bookingId;
}

// "ama@example.com" -> "a***@example.com"
function maskEmail(email) {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

router.post("/view", asyncHandler(async (req, res) => {
  const bookingId = bookingIdFromRequest(req, res);
  if (bookingId === null) return;

  try {
    // Status is decided by the database clock, the same one the cancel
    // statement uses, so the page never offers a cancel that would be refused.
    const result = await pool.query(
      `SELECT b.id, b.mentee_name, b.mentee_email, b.start_time, b.end_time, b.duration_minutes,
              m.name AS mentor_name, m.title AS mentor_title, m.color AS mentor_color,
              CASE WHEN b.start_time > now() THEN 'upcoming'
                   WHEN b.end_time > now() THEN 'started'
                   ELSE 'past' END AS status
       FROM bookings b
       JOIN mentors m ON m.id = b.mentor_id
       WHERE b.id = $1`,
      [bookingId]
    );
    if (result.rows.length === 0) return res.status(404).json(NOT_FOUND);
    const row = result.rows[0];
    res.json({
      booking: {
        mentor_name: row.mentor_name,
        mentor_title: row.mentor_title,
        mentor_color: row.mentor_color,
        start_time: row.start_time,
        end_time: row.end_time,
        duration_minutes: row.duration_minutes,
        status: row.status,
        // Enough to recognise the booking, not enough to harvest.
        mentee_first_name: firstName(row.mentee_name),
        mentee_email_masked: maskEmail(row.mentee_email),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the booking." });
  }
}));

// One atomic DELETE does the "not started yet" check and the removal, so
// there is no select-then-delete race. Cancelling frees the slot because
// availability is computed live from the remaining rows.
router.post("/cancel", asyncHandler(async (req, res) => {
  const bookingId = bookingIdFromRequest(req, res);
  if (bookingId === null) return;

  try {
    const deleted = await pool.query(
      "DELETE FROM bookings WHERE id = $1 AND start_time > now() RETURNING id",
      [bookingId]
    );
    if (deleted.rows.length === 1) {
      return res.json({ cancelled: true });
    }

    // Nothing deleted: the booking is either gone (already cancelled) or has
    // started. Only now look, read-only, to pick the right answer.
    const existing = await pool.query("SELECT 1 FROM bookings WHERE id = $1", [bookingId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "That session has already started, so it can't be cancelled." });
    }
    res.status(404).json(NOT_FOUND);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not cancel the booking." });
  }
}));

module.exports = router;
