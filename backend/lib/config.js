// CORS_ORIGIN as a single origin. Browsers send Origin without a trailing
// slash, so "https://app.example.com/" would never match; strip it.
function resolveCorsOrigin(env = process.env, warn = console.warn) {
  const raw = (env.CORS_ORIGIN || "").trim().replace(/\/+$/, "");
  if (raw) return raw;
  if (env.NODE_ENV === "production") {
    warn("CORS_ORIGIN is not set; allowing requests from any origin. Set it to your frontend's origin.");
  }
  return "*";
}

module.exports = { resolveCorsOrigin };
