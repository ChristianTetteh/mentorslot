// Business-hours grid for mentor availability. There is no longer a
// pre-generated table of bookable slots (see migrations/001_initial.sql) — availability for
// a given duration is computed on request as "candidate grid starts minus
// whatever's already booked" (routes/mentors.js). This module only produces
// the candidate grid; it has no opinion about what's already taken.

const SLOT_START_HOUR = 9; // 09:00
const MORNING_END_HOUR = 12; // morning block ends at 12:00
const AFTERNOON_START_HOUR = 13; // afternoon block resumes at 13:00 (lunch between)
const SLOT_END_HOUR = 17; // business day ends at 17:00
const BUFFER_MINUTES = 15; // gap left between the end of one candidate session and the start of the next
const DAYS_AHEAD = 14; // look this many calendar days into the future by default
const MAX_DAYS_AHEAD = 30; // furthest the slots endpoint will look; bookings beyond it are refused
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

// Yields { start, boundary } for every candidate session start in one
// business day, where `boundary` is the business-hour edge (12:00 or 17:00)
// a session starting at `start` must not run past.
//
// Candidates are spaced `duration + BUFFER_MINUTES` apart within each
// business-hours block (09:00-12:00, 13:00-17:00), starting fresh at the top
// of each block, rather than falling on a fixed grid independent of
// duration. That matters once sessions can be different lengths: a fixed
// half-hour grid would offer 9:00-9:45 *and* 9:30-10:15 for a 45-minute
// session — two candidates that can't both be booked, and that leave the
// mentor no breathing room even when only one is. Spacing by the actual
// session length (plus a buffer) means the next candidate after 9:00-9:45
// is 10:00-10:45, not an overlapping or back-to-back one.
function* gridStartsForDay(dayStart, duration) {
  const step = duration + BUFFER_MINUTES;
  const blocks = [
    { startHour: SLOT_START_HOUR, endHour: MORNING_END_HOUR },
    { startHour: AFTERNOON_START_HOUR, endHour: SLOT_END_HOUR },
  ];

  for (const block of blocks) {
    const blockEndMinutes = block.endHour * 60;
    const boundary = new Date(dayStart);
    boundary.setUTCHours(block.endHour, 0, 0, 0);

    for (let cursor = block.startHour * 60; cursor + duration <= blockEndMinutes; cursor += step) {
      const start = new Date(dayStart);
      // setUTCHours' minutes argument overflows correctly (e.g. hours=0,
      // minutes=570 lands on 09:30), so this doesn't need its own hour/minute split.
      start.setUTCHours(0, cursor, 0, 0);
      yield { start, boundary };
    }
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// [earliest, latest) window of instants the slots endpoint can offer: from the
// start of tomorrow (UTC) through the end of the day `MAX_DAYS_AHEAD` days out.
function offeredWindow(now) {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return {
    earliest: new Date(today.getTime() + DAY_MS),
    latest: new Date(today.getTime() + (MAX_DAYS_AHEAD + 1) * DAY_MS),
  };
}

// Every candidate session for `duration` over the next `days` days: the one
// definition of "offerable" shared by the slots endpoint (to list them) and
// booking validation (to refuse anything that isn't one).
function* candidateSlots(now, days, duration) {
  const durationMs = duration * 60 * 1000;
  for (const day of businessDays(now, days)) {
    for (const { start, boundary } of gridStartsForDay(day, duration)) {
      if (start <= now) continue;
      const end = new Date(start.getTime() + durationMs);
      if (end > boundary) continue; // defensive — gridStartsForDay already keeps candidates within the block
      yield { start, end };
    }
  }
}

function isOfferedStart(start, duration, now) {
  const t = start.getTime();
  for (const slot of candidateSlots(now, MAX_DAYS_AHEAD, duration)) {
    if (slot.start.getTime() === t) return true;
  }
  return false;
}

module.exports = {
  BUFFER_MINUTES,
  DAYS_AHEAD,
  MAX_DAYS_AHEAD,
  ALLOWED_DURATIONS,
  DEFAULT_DURATION,
  businessDays,
  gridStartsForDay,
  offeredWindow,
  candidateSlots,
  isOfferedStart,
};
