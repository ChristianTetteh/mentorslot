const { ALLOWED_DURATIONS } = require("./schedule");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateBookingInput({ mentor_id, start_time, duration, name, email }) {
  const mentorId = Number(mentor_id);
  if (!Number.isInteger(mentorId) || mentorId <= 0) {
    return { error: "A valid mentor must be selected." };
  }

  const start = new Date(start_time);
  if (!start_time || Number.isNaN(start.getTime())) {
    return { error: "A valid start time is required." };
  }
  if (start.getTime() <= Date.now()) {
    return { error: "Pick a time in the future." };
  }

  const durationMinutes = Number(duration);
  if (!ALLOWED_DURATIONS.includes(durationMinutes)) {
    return { error: `Session length must be one of: ${ALLOWED_DURATIONS.join(", ")} minutes.` };
  }

  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    return { error: "Name must be between 2 and 100 characters." };
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim()) || email.trim().length > 200) {
    return { error: "A valid email address is required." };
  }

  return {
    mentorId,
    start,
    end: new Date(start.getTime() + durationMinutes * 60 * 1000),
    durationMinutes,
    name: name.trim(),
    email: email.trim().toLowerCase(),
  };
}

module.exports = { validateBookingInput };
