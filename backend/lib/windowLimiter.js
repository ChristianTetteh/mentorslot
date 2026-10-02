const crypto = require("crypto");

// Tiny in-memory fixed-window counter keyed by a string (here: an email
// address). Keys are hashed so the process doesn't keep a list of addresses.
// Per-process, which is right for a single Render instance; a second instance
// would need a shared store.
function createWindowLimiter({ max, windowMs, maxKeys = 50000, now = () => Date.now() }) {
  const hits = new Map(); // hash -> { count, resetAt }

  const hash = (key) => crypto.createHash("sha256").update(key).digest("base64");

  function prune(t) {
    for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
    // Still too big (a flood of distinct keys inside one window): drop the
    // oldest entries rather than grow without bound.
    while (hits.size >= maxKeys) hits.delete(hits.keys().next().value);
  }

  return {
    // True if this attempt is within the budget (and counts it).
    take(key) {
      const t = now();
      const k = hash(key);
      let entry = hits.get(k);
      if (!entry || entry.resetAt <= t) {
        if (!entry && hits.size >= maxKeys) prune(t);
        entry = { count: 0, resetAt: t + windowMs };
        hits.set(k, entry);
      }
      entry.count += 1;
      return entry.count <= max;
    },
    reset() {
      hits.clear();
    },
  };
}

module.exports = { createWindowLimiter };
