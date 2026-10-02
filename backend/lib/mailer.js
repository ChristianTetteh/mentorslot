const { isProduction } = require("./config");

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 10000;

// A provider counts as configured only when it could actually send: an API
// key and a sender address (Brevo rejects mail without a verified sender).
function isConfigured(env = process.env) {
  return !!(String(env.BREVO_API_KEY || "").trim() && String(env.MAIL_FROM || "").trim());
}

// Sends one email through Brevo's REST API. NEVER throws and never rejects:
// it resolves { sent: true|false }, so a mail outage can't break a request.
// Never logs the API key, and logs only status codes, never message bodies
// (which contain private links) in production.
async function sendMail({ to, subject, text, html }, { env = process.env, fetchImpl } = {}) {
  try {
    if (!isConfigured(env)) {
      if (isProduction(env)) {
        console.warn("Email is not configured (set BREVO_API_KEY and MAIL_FROM); message not sent.");
      } else {
        // Local development: show what would have been sent, link included.
        console.log(`[mail:dev] not sent (no BREVO_API_KEY/MAIL_FROM)\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
      }
      return { sent: false };
    }

    const doFetch = fetchImpl || globalThis.fetch;
    const payload = {
      sender: { name: String(env.MAIL_FROM_NAME || "").trim() || "MentorSlot", email: String(env.MAIL_FROM).trim() },
      to: [{ email: to }],
      subject,
      textContent: text,
    };
    if (html) payload.htmlContent = html;

    const res = await doFetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": String(env.BREVO_API_KEY).trim(),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      let code = "";
      try {
        const body = await res.json();
        if (body && typeof body.code === "string") code = ` (${body.code.slice(0, 60)})`;
      } catch {
        // no usable body; the status is enough
      }
      console.error(`Email provider rejected a message: HTTP ${res.status}${code}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    // err.name / message only (e.g. TimeoutError, "fetch failed").
    console.error(`Email send failed: ${err && err.name ? err.name : "Error"}: ${err && err.message ? err.message : ""}`);
    return { sent: false };
  }
}

module.exports = { sendMail, isConfigured, BREVO_URL };
