const { createWindowLimiter } = require("./windowLimiter");

const HOUR = 60 * 60 * 1000;

// At most 5 link emails per address per hour, so the lookup form can't be
// used to flood someone's inbox. Hitting it is silent (same 200 as always).
const lookupEmailLimiter = createWindowLimiter({ max: 5, windowMs: HOUR });

// Booking confirmations go to whatever address the booker typed, so they get
// their own per-recipient cap (separate from the lookup budget, so spamming
// confirmations to a victim can't also use up the victim's own lookups).
const confirmEmailLimiter = createWindowLimiter({ max: 5, windowMs: HOUR });

module.exports = { lookupEmailLimiter, confirmEmailLimiter };
