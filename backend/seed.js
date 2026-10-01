require("dotenv").config();
const pool = require("./db");

const MENTORS = [
  {
    name: "Ama Boateng",
    title: "Senior Product Manager",
    bio: "10 years shipping consumer products. Happy to talk roadmaps, interviews, or breaking into PM from another field.",
    color: "#2DD4BF",
  },
  {
    name: "Kwame Owusu",
    title: "Software Engineer",
    bio: "Backend-leaning full-stack engineer. Can help with technical interview prep, system design basics, or career pivots into tech.",
    color: "#6C63FF",
  },
  {
    name: "Efua Mensah",
    title: "UX Designer",
    bio: "Portfolio reviews, design critique, and advice on landing your first design role.",
    color: "#FF6B6B",
  },
  {
    name: "Nana Yaw Asante",
    title: "Data Analyst",
    bio: "SQL, dashboards, and how to talk about data work in interviews without drowning people in jargon.",
    color: "#F5A623",
  },
];

const SLOT_START_HOUR = 9; // 09:00
const MORNING_END_HOUR = 12; // slots stop at 12:00, resume at 13:00
const SLOT_END_HOUR = 17; // 17:00
const SLOT_MINUTES = 30;
const DAYS_AHEAD = 7; // generate slots for the next 7 calendar days
const WEEKDAYS_ONLY = true;

function isWeekday(date) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

function* slotTimesForDay(dayStart) {
  for (let hour = SLOT_START_HOUR; hour < SLOT_END_HOUR; hour++) {
    if (hour >= MORNING_END_HOUR && hour < 13) continue; // lunch break
    for (let min = 0; min < 60; min += SLOT_MINUTES) {
      const start = new Date(dayStart);
      start.setUTCHours(hour, min, 0, 0);
      const end = new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);
      yield { start, end };
    }
  }
}

async function seed() {
  const mentorIds = [];
  for (const m of MENTORS) {
    const existing = await pool.query("SELECT id FROM mentors WHERE name = $1", [m.name]);
    if (existing.rows.length) {
      mentorIds.push(existing.rows[0].id);
      continue;
    }
    const result = await pool.query(
      `INSERT INTO mentors (name, title, bio, color) VALUES ($1, $2, $3, $4) RETURNING id`,
      [m.name, m.title, m.bio, m.color]
    );
    mentorIds.push(result.rows[0].id);
  }
  console.log(`✓ ${mentorIds.length} mentors ready.`);

  let slotsCreated = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let d = 1; d <= DAYS_AHEAD; d++) {
    const day = new Date(today.getTime() + d * 24 * 60 * 60 * 1000);
    if (WEEKDAYS_ONLY && !isWeekday(day)) continue;

    for (const mentorId of mentorIds) {
      for (const { start, end } of slotTimesForDay(day)) {
        const result = await pool.query(
          `INSERT INTO slots (mentor_id, start_time, end_time)
           VALUES ($1, $2, $3)
           ON CONFLICT (mentor_id, start_time) DO NOTHING`,
          [mentorId, start.toISOString(), end.toISOString()]
        );
        slotsCreated += result.rowCount;
      }
    }
  }
  console.log(`✓ ${slotsCreated} new slots created (existing ones left untouched).`);
  await pool.end();
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
