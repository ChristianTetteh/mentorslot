const crypto = require("crypto");
const { getManageSecret } = require("./config");

// A manage token is `${bookingId}.${mac}` where
//   mac = base64url(HMAC-SHA256(MANAGE_SECRET, 'manage:' + bookingId)).
// Nothing is stored: the token is recomputed from the booking id and the
// server secret, so the database never holds a credential, and a leaked
// database alone cannot be used to cancel anything.
//
// The 'manage:' prefix domain-separates this MAC from any other use of the
// same secret. A SHA-256 MAC is 32 bytes = 43 base64url characters.
const MAC_LENGTH = 43;
const TOKEN_RE = /^([1-9]\d{0,9})\.([A-Za-z0-9_-]{43})$/;
const MAX_TOKEN_LENGTH = 10 + 1 + MAC_LENGTH;
const INT32_MAX = 2147483647;

function macFor(bookingId, env) {
  return crypto.createHmac("sha256", getManageSecret(env)).update(`manage:${bookingId}`).digest("base64url");
}

function createManageToken(bookingId, env = process.env) {
  return `${bookingId}.${macFor(bookingId, env)}`;
}

// Returns the booking id for a genuine token, otherwise null. Shape is
// checked first, so malformed input never costs an HMAC (let alone a database
// query); the MAC comparison is constant-time.
function verifyManageToken(token, env = process.env) {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return null;
  const match = TOKEN_RE.exec(token);
  if (!match) return null;
  const bookingId = Number(match[1]);
  if (!Number.isSafeInteger(bookingId) || bookingId > INT32_MAX) return null;

  const given = Buffer.from(match[2], "utf8");
  const expected = Buffer.from(macFor(bookingId, env), "utf8");
  if (given.length !== expected.length) return null;
  return crypto.timingSafeEqual(given, expected) ? bookingId : null;
}

module.exports = { createManageToken, verifyManageToken };
