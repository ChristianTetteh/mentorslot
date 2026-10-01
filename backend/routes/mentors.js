const express = require("express");
const pool = require("../db");

const router = express.Router();

// List all mentors.
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, title, bio, color FROM mentors ORDER BY name ASC"
    );
    res.json({ mentors: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load mentors." });
  }
});

// List a mentor's upcoming *available* slots, grouped by day on the client.
router.get("/:id/slots", async (req, res) => {
  const mentorId = Number(req.params.id);
  if (!Number.isInteger(mentorId) || mentorId <= 0) {
    return res.status(400).json({ error: "Invalid mentor id." });
  }
  const days = Math.min(Number(req.query.days) || 7, 30);

  try {
    const mentor = await pool.query("SELECT id, name, title, color FROM mentors WHERE id = $1", [
      mentorId,
    ]);
    if (mentor.rows.length === 0) {
      return res.status(404).json({ error: "Mentor not found." });
    }

    const slots = await pool.query(
      `SELECT id, start_time, end_time
       FROM slots
       WHERE mentor_id = $1
         AND status = 'available'
         AND start_time > now()
         AND start_time < now() + ($2 || ' days')::interval
       ORDER BY start_time ASC`,
      [mentorId, days]
    );

    res.json({ mentor: mentor.rows[0], slots: slots.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load slots." });
  }
});

module.exports = router;
