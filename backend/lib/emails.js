// Email bodies. Plain text plus a simple HTML version. Anything interpolated
// into HTML is escaped; the only user-chosen data is the mentor's name/title
// from our own database, and the booker's own typed text is never echoed.
const { getFrontendOrigin } = require("./config");
const { createManageToken } = require("./manageToken");

const WARNING = "Anyone with this link can cancel the booking, so don't forward it.";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Link from configuration only (never from request headers). The token rides
// in the URL fragment so it is never sent to any server, proxy or access log.
function manageLink(bookingId, env = process.env) {
  const origin = getFrontendOrigin(env);
  if (!origin) return null;
  return `${origin}/manage#${createManageToken(bookingId, env)}`;
}

const pad = (n) => String(n).padStart(2, "0");
const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const hm = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

// "Tuesday 5 March 2030, 09:00–09:30 UTC" (time-zone neutral) plus the exact
// ISO instants, so the reader can convert it however they like.
function describeTime(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  return {
    utc: `${DAY_FORMAT.format(start).replace(",", "")}, ${hm(start)}–${hm(end)} UTC`,
    iso: `${iso(start)} to ${iso(end)}`,
  };
}

function shell(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#EDF1EA;font-family:Arial,Helvetica,sans-serif;color:#14211B;">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-top:6px solid #2F5233;border-radius:8px;padding:24px;">
<h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(title)}</h1>
${bodyHtml}
</div></body></html>`;
}

function linkHtml(href) {
  return `<p style="margin:16px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#2F5233;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold;">Manage or cancel this booking</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#4F5E54;word-break:break-all;">${escapeHtml(href)}</p>`;
}

function confirmationEmail({ booking, mentor, link }) {
  const when = describeTime(booking.start_time, booking.end_time);
  const subject = `Your session with ${mentor.name} is booked`;
  const text = [
    `You're booked: a ${booking.duration_minutes}-minute session with ${mentor.name} (${mentor.title}).`,
    "",
    `When: ${when.utc}`,
    `Exact time: ${when.iso}`,
    "",
    "To see or cancel this booking, use your private link:",
    link,
    "",
    WARNING,
    "",
    "MentorSlot",
  ].join("\n");
  const html = shell(
    "You're booked",
    `<p style="margin:0 0 12px;">A ${escapeHtml(booking.duration_minutes)}-minute session with <strong>${escapeHtml(mentor.name)}</strong> (${escapeHtml(mentor.title)}).</p>
<p style="margin:0 0 4px;"><strong>${escapeHtml(when.utc)}</strong></p>
<p style="margin:0 0 12px;font-size:13px;color:#4F5E54;">Exact time: ${escapeHtml(when.iso)}</p>
${linkHtml(link)}
<p style="margin:16px 0 0;padding:10px 12px;background:#FBEFD0;border-left:3px solid #E0A526;font-size:14px;">${escapeHtml(WARNING)}</p>`
  );
  return { subject, text, html };
}

// items: [{ booking, mentor, link }] (already sorted by start time)
function linksEmail(items) {
  const subject = items.length === 1 ? "Your MentorSlot booking link" : "Your MentorSlot booking links";
  const blocks = items.map(({ booking, mentor, link }) => {
    const when = describeTime(booking.start_time, booking.end_time);
    return { booking, mentor, link, when };
  });
  const text = [
    "You asked for the links to your upcoming MentorSlot bookings.",
    "",
    ...blocks.flatMap(({ booking, mentor, link, when }) => [
      `${booking.duration_minutes}-minute session with ${mentor.name} (${mentor.title})`,
      `When: ${when.utc}`,
      `Exact time: ${when.iso}`,
      `Link: ${link}`,
      "",
    ]),
    WARNING,
    "",
    "If you didn't ask for this, you can ignore this email.",
    "",
    "MentorSlot",
  ].join("\n");
  const html = shell(
    items.length === 1 ? "Your booking link" : "Your booking links",
    `<p style="margin:0 0 12px;">You asked for the links to your upcoming bookings.</p>
${blocks
  .map(
    ({ booking, mentor, link, when }) => `<div style="margin:0 0 16px;padding:12px 0;border-top:1px solid #D5DCD1;">
<p style="margin:0 0 4px;"><strong>${escapeHtml(mentor.name)}</strong> (${escapeHtml(mentor.title)}), ${escapeHtml(booking.duration_minutes)} minutes</p>
<p style="margin:0 0 4px;">${escapeHtml(when.utc)}</p>
<p style="margin:0 0 4px;font-size:13px;color:#4F5E54;">Exact time: ${escapeHtml(when.iso)}</p>
${linkHtml(link)}
</div>`
  )
  .join("\n")}
<p style="margin:16px 0 0;padding:10px 12px;background:#FBEFD0;border-left:3px solid #E0A526;font-size:14px;">${escapeHtml(WARNING)}</p>
<p style="margin:16px 0 0;font-size:13px;color:#4F5E54;">If you didn't ask for this, you can ignore this email.</p>`
  );
  return { subject, text, html };
}

module.exports = { confirmationEmail, linksEmail, manageLink, escapeHtml, describeTime, WARNING };
