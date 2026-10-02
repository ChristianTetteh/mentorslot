// CORS_ORIGIN as a single origin. Browsers send Origin without a trailing
// slash, so "https://app.example.com/" would never match; strip it.
function resolveCorsOrigin(env = process.env, warn = console.warn) {
  const raw = (env.CORS_ORIGIN || "").trim().replace(/\/+$/, "");
  if (raw) return raw;
  if (isProduction(env)) {
    warn("CORS_ORIGIN is not set; allowing requests from any origin. Set it to your frontend's origin.");
  }
  return "*";
}

// Fail closed: anything that looks like production (including a mis-cased
// NODE_ENV, or Render's own RENDER=true marker) must use the strict secret
// rules below, so a typo can never leave the well-known dev secret in use.
function isProduction(env = process.env) {
  return String(env.NODE_ENV || "").trim().toLowerCase() === "production" || !!env.RENDER;
}

const MIN_SECRET_LENGTH = 32;
// Used ONLY outside production so local dev and tests work with no setup.
// It is public (it is in the repo), so tokens made with it are forgeable.
const DEV_MANAGE_SECRET = "dev-only-manage-secret-never-use-in-production";

// The HMAC key behind private manage links. Throws (never falls back) in
// production when it is missing or too short.
function getManageSecret(env = process.env) {
  const secret = env.MANAGE_SECRET;
  if (isProduction(env)) {
    if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`MANAGE_SECRET must be set to a random string of at least ${MIN_SECRET_LENGTH} characters in production.`);
    }
    return secret;
  }
  return typeof secret === "string" && secret.length > 0 ? secret : DEV_MANAGE_SECRET;
}

// Exact origin ("https://app.example.com", no path) or null.
function toOrigin(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw || raw === "*") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

// Where manage links point. From configuration only, NEVER from request
// headers (Host / X-Forwarded-Host are attacker-controlled and would let
// someone poison the links in emails). FRONTEND_ORIGIN, else the first value
// of CORS_ORIGIN, else (outside production) the local Vite dev server.
function getFrontendOrigin(env = process.env) {
  const fromFrontend = toOrigin(env.FRONTEND_ORIGIN);
  if (fromFrontend) return fromFrontend;
  const fromCors = toOrigin(String(env.CORS_ORIGIN || "").split(",")[0]);
  if (fromCors) return fromCors;
  return isProduction(env) ? null : "http://localhost:5173";
}

// Called once at boot. Refuses to start (throws) when production is missing
// something the private-link security model depends on.
function assertProductionConfig(env = process.env) {
  if (!isProduction(env)) return;
  getManageSecret(env); // throws if missing/short
  if (env.FRONTEND_ORIGIN && !toOrigin(env.FRONTEND_ORIGIN)) {
    throw new Error("FRONTEND_ORIGIN must be an origin like https://app.example.com (no path).");
  }
  if (env.BREVO_API_KEY && !getFrontendOrigin(env)) {
    throw new Error("Email is configured but there is no frontend origin for links: set FRONTEND_ORIGIN (or CORS_ORIGIN).");
  }
}

module.exports = {
  resolveCorsOrigin,
  isProduction,
  getManageSecret,
  getFrontendOrigin,
  assertProductionConfig,
  MIN_SECRET_LENGTH,
  DEV_MANAGE_SECRET,
};
