import { useEffect, useState } from "react";
import api from "../api";
import { Alert } from "../components/Icons.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function FindBookings() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok: true, text } | { ok: false, text }

  useEffect(() => {
    // Earlier versions remembered the last email in this browser to list
    // bookings by it. Nothing is looked up by email any more, so tidy it away.
    try {
      localStorage.removeItem("mentorslot_last_email");
    } catch {
      // storage unavailable: nothing to clean up
    }
  }, []);

  async function submit(e) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    setResult(null);
    if (!EMAIL_RE.test(value)) {
      setResult({ ok: false, text: "Enter a valid email." });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post("/bookings/lookup", { email: value });
      setResult({ ok: true, text: res.data.message });
    } catch (err) {
      const status = err.response?.status;
      const apiMessage = err.response?.data?.error;
      if (status === 503 || status === 400) {
        setResult({ ok: false, text: apiMessage || "Couldn't send links right now." });
      } else if (status === 429) {
        setResult({ ok: false, text: "Too many requests. Please try again in a while." });
      } else {
        setResult({ ok: false, text: "Couldn't reach the server. Try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page-narrow">
      <h1 className="page-title">Find my bookings</h1>
      <p className="hero-sub">
        Every booking has a private link that lets you see it and cancel it. Enter the email you booked with and we'll
        send you the link for each upcoming session.
      </p>

      <form className="lookup-form" onSubmit={submit} noValidate>
        <label className="lookup-field" htmlFor="find-email">
          Email you booked with
          <input
            id="find-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Email me my links"}
        </button>
      </form>

      <div id="find-result" role="status" aria-live="polite">
        {result && result.ok && <p className="success-banner">{result.text}</p>}
      </div>
      {result && !result.ok && (
        <p className="error-banner" role="alert">
          <Alert />
          <span>{result.text}</span>
        </p>
      )}

      <p className="muted hint">
        Just booked? The private link is on your confirmation screen and in your confirmation email. Anyone with a link
        can cancel that booking, so keep it to yourself.
      </p>
    </div>
  );
}
