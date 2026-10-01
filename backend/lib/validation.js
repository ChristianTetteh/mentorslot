const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateBookingInput({ slot_id, name, email }) {
  const numericSlotId = Number(slot_id);
  if (!Number.isInteger(numericSlotId) || numericSlotId <= 0) {
    return { error: "A valid slot must be selected." };
  }
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    return { error: "Name must be between 2 and 100 characters." };
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim()) || email.trim().length > 200) {
    return { error: "A valid email address is required." };
  }
  return {
    slotId: numericSlotId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
  };
}

module.exports = { validateBookingInput };
