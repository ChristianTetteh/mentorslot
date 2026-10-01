const express = require("express");
const pool = require("../db");
const { validateBookingInput } = require("../lib/validation");

const router = express.Router();

// Book a slot. This is the core "prevent double-booking" guarantee:
//
// The UPDATE below only succeeds if the slot is still `status = 'available'`.
// Postgres takes a row lock on the slot the instant this UPDATE runs, so if
// two requests hit the same slot_id at the same time, one of them blocks
// until the other's transaction commits or rolls back — it then re-checks
// `status = 'available'`, finds it already `'booked'`, and affects zero rows.
// That request gets a 409, and only one booking can ever exist for a slot.
//
// The UNIQUE constraint on bookings.slot_id (schema.sql) is a second,
// independent line of defense in case this endpoint is ever bypassed.
router.post("/", async (req, res) => {
  const { slotId, name, email, error } = validateBookingInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const slotUpdate = await client.query(
      `UPDATE slots
       SET status = 'booked'
       WHERE id = $1 AND status = 'available' AND start_time > now()
       RETURNING mentor_id, start_time, end_time`,
      [slotId]
    );

    if (slotUpdate.rowCount === 0) {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ error: "That slot just got booked or no longer exists. Please pick another." });
    }

    const { mentor_id, start_time, end_time } = slotUpdate.rows[0];

    const booking = await client.query(
      `INSERT INTO bookings (slot_id, mentor_id, mentee_name, mentee_email)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [slotId, mentor_id, name, email]
    );

    const mentor = await client.query("SELECT name, title FROM mentors WHERE id = $1", [
      mentor_id,
    ]);

    await client.query("COMMIT");

    res.status(201).json({
      booking: {
        id: booking.rows[0].id,
        slot_id: slotId,
        mentor_id,
        mentor_name: mentor.rows[0]?.name,
        mentor_title: mentor.rows[0]?.title,
        start_time,
        end_time,
        mentee_name: name,
        mentee_email: email,
        created_at: booking.rows[0].created_at,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      // Unique violation on bookings.slot_id — the defense-in-depth layer caught it.
      return res
        .status(409)
        .json({ error: "That slot just got booked. Please pick another." });
    }
    console.error(err);
    res.status(500).json({ error: "Could not create the booking." });
  } finally {
    client.release();
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
      `SELECT b.id, b.slot_id, b.mentee_name, b.mentee_email, b.created_at,
              s.start_time, s.end_time,
              m.id AS mentor_id, m.name AS mentor_name, m.title AS mentor_title, m.color
       FROM bookings b
       JOIN slots s ON s.id = b.slot_id
       JOIN mentors m ON m.id = b.mentor_id
       WHERE b.mentee_email = $1
       ORDER BY s.start_time ASC`,
      [email]
    );
    res.json({ bookings: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load bookings." });
  }
});

// Cancel a booking (must supply the same email it was booked with — the only
// "ownership" check available without a login system) and free the slot.
router.delete("/:id", async (req, res) => {
  const bookingId = Number(req.params.id);
  const email = (req.body.email || "").trim().toLowerCase();
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking id." });
  }
  if (!email) {
    return res.status(400).json({ error: "Email is required to cancel a booking." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT slot_id, mentee_email FROM bookings WHERE id = $1",
      [bookingId]
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found." });
    }
    if (existing.rows[0].mentee_email !== email) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "That email doesn't match this booking." });
    }

    await client.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
    await client.query("UPDATE slots SET status = 'available' WHERE id = $1", [
      existing.rows[0].slot_id,
    ]);

    await client.query("COMMIT");
    res.json({ cancelled: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not cancel the booking." });
  } finally {
    client.release();
  }
});

module.exports = router;
