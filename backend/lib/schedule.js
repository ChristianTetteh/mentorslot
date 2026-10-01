// Business-hours grid for mentor availability. There is no longer a
// pre-generated table of bookable slots (see schema.sql) — availability for
// a given duration is computed on request as "candidate grid starts minus
// whatever's already booked" (routes/mentors.js). This module only produces
// the candidate grid; it has no opinion about what's already taken.

const SLOT_START_HOUR = 9; // 09:00
const MORNING_END_HOUR = 12; // morning block ends at 12:00
const AFTERNOON_START_HOUR = 13; // afternoon block resumes at 13:00 (lunch between)
const SLOT_END_HOUR = 17; // business day ends at 17:00
const GRID_MINUTES = 30; // candidate start times fall on the half hour
const DAYS_AHEAD = 14; // look this many calendar days into the future by default
const WEEKDAYS_ONLY = true;

const ALLOWED_DURATIONS = [30, 45, 60];
const DEFAULT_DURATION = 30;

function isWeekday(date) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

// Calendar days (as UTC midnight Dates), from tomorrow through `daysAhead`
// days out, filtered to weekdays.
function businessDays(fromDate, daysAhead) {
  const base = new Date(fromDate);
  base.setUTCHours(0, 0, 0, 0);
  const days = [];
  for (let d = 1; d <= daysAhead; d++) {
    const day = new Date(base.getTime() + d * 24 * 60 * 60 * 1000);
    if (!WEEKDAYS_ONLY || isWeekday(day)) days.push(day);
  }
  return days;
}

// Yields { start, boundary } for every half-hour mark in one business day,
// where `boundary` is the business-hour edge (12:00 or 17:00) a session
// starting at `start` must not run past — the actual guard against a 60-
// minute session starting at 11:30 spilling into the lunch break, or one at
// 16:30 spilling past closing.
function* gridStartsForDay(dayStart) {
  for (let hour = SLOT_START_HOUR; hour < SLOT_END_HOUR; hour++) {
    if (hour >= MORNING_END_HOUR && hour < AFTERNOON_START_HOUR) continue; // lunch
    for (let min = 0; min < 60; min += GRID_MINUTES) {
      const start = new Date(dayStart);
      start.setUTCHours(hour, min, 0, 0);
      const boundaryHour = hour < MORNING_END_HOUR ? MORNING_END_HOUR : SLOT_END_HOUR;
      const boundary = new Date(dayStart);
      boundary.setUTCHours(boundaryHour, 0, 0, 0);
      yield { start, boundary };
    }
  }
}

module.exports = {
  SLOT_START_HOUR,
  MORNING_END_HOUR,
  AFTERNOON_START_HOUR,
  SLOT_END_HOUR,
  GRID_MINUTES,
  DAYS_AHEAD,
  ALLOWED_DURATIONS,
  DEFAULT_DURATION,
  isWeekday,
  businessDays,
  gridStartsForDay,
};
