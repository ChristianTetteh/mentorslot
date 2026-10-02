const { ALLOWED_DURATIONS, MAX_DAYS_AHEAD, offeredWindow, isOfferedStart } = require("./schedule");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INT32_MAX = 2147483647;
// ISO 8601 date-time with an explicit offset (Z or +hh:mm). Offset-less
// strings are ambiguous (server-local vs UTC), so they're rejected.
const ISO_WITH_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

// A positive int32 from a number or a digits-only string, else null. Anything
// else (arrays, objects, "1e3", " 5", out-of-range) is rejected so it can't
// reach Postgres as an out-of-range integer and surface as a 500.
function parseId(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 && value <= INT32_MAX ? value : null;
  }
  if (typeof value === "string" && /^\d{1,10}$/.test(value)) {
    const n = Number(value);
    return n > 0 && n <= INT32_MAX ? n : null;
  }
  return null;
}

// Optional integer query param within [min, max]. Returns { value } (fallback
// when absent) or { error: true } when present but not a valid integer in range.
function parseIntParam(value, { min, max, fallback }) {
  if (value === undefined) return { value: fallback };
  if (typeof value !== "string" || !/^\d{1,6}$/.test(value)) return { error: true };
  const n = Number(value);
  return n >= min && n <= max ? { value: n } : { error: true };
}

// Trimmed, lower-cased email, or null if it isn't a plausible string address.
function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 200 && EMAIL_RE.test(email) ? email : null;
}

function validateBookingInput(body) {
  const { mentor_id, start_time, duration, name, email } = body && typeof body === "object" ? body : {};
  const mentorId = parseId(mentor_id);
  if (mentorId === null) {
    return { error: "A valid mentor must be selected." };
  }

  if (typeof start_time !== "string" || !ISO_WITH_OFFSET_RE.test(start_time)) {
    return { error: "A valid start time with a timezone (e.g. 2026-10-05T09:00:00Z) is required." };
  }
  const start = new Date(start_time);
  if (Number.isNaN(start.getTime())) {
    return { error: "A valid start time is required." };
  }
  const now = new Date(Date.now());
  if (start <= now) {
    return { error: "Pick a time in the future." };
  }

  const durationMinutes = typeof duration === "number" || typeof duration === "string" ? Number(duration) : NaN;
  if (!ALLOWED_DURATIONS.includes(durationMinutes)) {
    return { error: `Session length must be one of: ${ALLOWED_DURATIONS.join(", ")} minutes.` };
  }

  // The UI only offers grid slots, but the server must not rely on that: the
  // start has to be one the slots endpoint would actually list.
  const window = offeredWindow(now);
  if (start < window.earliest) {
    return { error: "Sessions can be booked from tomorrow onwards." };
  }
  if (start >= window.latest) {
    return { error: `Sessions can be booked up to ${MAX_DAYS_AHEAD} days ahead.` };
  }
  if (!isOfferedStart(start, durationMinutes, now)) {
    return { error: "That start time isn't available. Pick one from the list of open times." };
  }

  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    return { error: "Name must be between 2 and 100 characters." };
  }
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail === null) {
    return { error: "A valid email address is required." };
  }

  return {
    mentorId,
    start,
    end: new Date(start.getTime() + durationMinutes * 60 * 1000),
    durationMinutes,
    name: name.trim(),
    email: normalizedEmail,
  };
}

module.exports = { validateBookingInput, parseId, parseIntParam, normalizeEmail };
