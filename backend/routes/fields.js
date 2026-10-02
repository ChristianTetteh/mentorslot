const express = require("express");
const pool = require("../db");
const asyncHandler = require("../lib/asyncHandler");
const { parseId } = require("../lib/validation");

const router = express.Router({ caseSensitive: true, strict: true });

// List all fields with a count of mentors in each, for the homepage grid.
router.get("/", asyncHandler(async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.name, f.slug, f.color, COUNT(m.id)::int AS mentor_count
       FROM fields f
       LEFT JOIN mentors m ON m.field_id = f.id
       GROUP BY f.id
       ORDER BY f.id ASC`
    );
    res.json({ fields: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load fields." });
  }
}));

// List the mentors within one field.
router.get("/:id/mentors", asyncHandler(async (req, res) => {
  const fieldId = parseId(req.params.id);
  if (fieldId === null) {
    return res.status(400).json({ error: "Invalid field id." });
  }

  try {
    const field = await pool.query("SELECT id, name, slug, color FROM fields WHERE id = $1", [
      fieldId,
    ]);
    if (field.rows.length === 0) {
      return res.status(404).json({ error: "Field not found." });
    }

    const mentors = await pool.query(
      "SELECT id, name, title, bio, color FROM mentors WHERE field_id = $1 ORDER BY name ASC",
      [fieldId]
    );

    res.json({ field: field.rows[0], mentors: mentors.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load mentors for this field." });
  }
}));

module.exports = router;
