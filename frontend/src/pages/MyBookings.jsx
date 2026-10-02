import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { fullDateTimeRangeLabel, dateParts, viewerTimeZone } from "../utils/dates";
import { Globe, Alert } from "../components/Icons.jsx";

const LAST_EMAIL_KEY = "mentorslot_last_email";

export default function MyBookings() {
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState(null);
  // Presentational two-step cancel: which row is showing its "are you sure?" strip.
  const [confirmingId, setConfirmingId] = useState(null);
  const [cancelledNote, setCancelledNote] = useState("");
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    try {
      const remembered = localStorage.getItem(LAST_EMAIL_KEY);
      if (remembered) {
        setEmail(remembered);
        lookUp(remembered);
      }
    } catch {
      // localStorage unavailable — just skip the convenience prefill.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookUp(targetEmail) {
    const value = (targetEmail || email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email.");
      return;
    }
    setError("");
    try {
      const res = await api.get("/bookings", { params: { email: value } });
      setBookings(res.data.bookings);
      setSubmittedEmail(value);
      try {
        localStorage.setItem(LAST_EMAIL_KEY, value);
      } catch {
        // per-viewer convenience only — fine if it can't be stored.
      }
    } catch {
      setError("Couldn't load bookings right now. Try again.");
    }
  }

  async function cancel(bookingId) {
    setCancellingId(bookingId);
    try {
      await api.delete(`/bookings/${bookingId}`, { data: { email: submittedEmail } });
      setBookings((prev) => prev.filter((b) => b.id !== bookingId));
      setCancelledNote("Booking cancelled. That time is open again.");
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't cancel that booking. Try again.");
    } finally {
      setCancellingId(null);
      setConfirmingId(null);
    }
  }

  const timeZone = viewerTimeZone();

  return (
    <div className="page page-narrow">
      <h1 className="page-title">My bookings</h1>
      <p className="hero-sub">
        Since there's no account, enter the email you booked with to see or cancel a session.
      </p>

      <form
        className="lookup-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setCancelledNote("");
          setConfirmingId(null);
          setLooking(true);
          await lookUp();
          setLooking(false);
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email you booked with"
          autoComplete="email"
        />
        <button className="btn-primary" type="submit" disabled={looking}>
          {looking ? "Looking…" : "Find my bookings"}
        </button>
      </form>

      {error && (
        <p className="error-banner" role="alert">
          <Alert />
          <span>{error}</span>
        </p>
      )}

      <p className="sr-only" role="status">{cancelledNote}</p>
      {cancelledNote && <p className="success-banner" aria-hidden="true">{cancelledNote}</p>}

      {!bookings && !error && (
        <p className="muted hint">Your sessions will appear here once you look up your email.</p>
      )}

      {bookings && (
        bookings.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No bookings under {submittedEmail}.</p>
            <p className="muted">Check the spelling, or use the email you gave when you booked.</p>
            <Link to="/" className="btn-primary">Find a mentor</Link>
          </div>
        ) : (
          <>
            <div className="list-head">
              <h2 className="section-title">
                {bookings.length} {bookings.length === 1 ? "session" : "sessions"} booked
              </h2>
              {timeZone && <p className="tz-note"><Globe /> Times in {timeZone}</p>}
            </div>
            <ul className="booking-list">
              {bookings.map((b) => {
                const parts = dateParts(b.start_time);
                const confirming = confirmingId === b.id;
                const when = fullDateTimeRangeLabel(b.start_time, b.end_time);
                return (
                  <li key={b.id} className="booking-row" style={{ "--c": b.color }}>
                    <div className="date-block" aria-hidden="true">
                      <span className="date-block-weekday">{parts.weekday}</span>
                      <span className="date-block-day">{parts.day}</span>
                      <span className="date-block-month">{parts.month}</span>
                    </div>
                    <div className="booking-row-body">
                      <p className="booking-row-mentor">
                        {b.mentor_name} <span className="chip">{b.duration_minutes} min</span>
                      </p>
                      <p className="booking-row-when">{when}</p>
                    </div>
                    {confirming ? (
                      <div className="cancel-confirm" role="group" aria-label={`Confirm cancelling ${b.mentor_name}`}>
                        <p>Cancel this session? The time goes back to the mentor's open slots.</p>
                        <div className="cancel-confirm-actions">
                          <button
                            className="btn-danger-solid"
                            onClick={() => cancel(b.id)}
                            disabled={cancellingId === b.id}
                          >
                            {cancellingId === b.id ? "Cancelling…" : "Yes, cancel session"}
                          </button>
                          <button
                            className="btn-ghost"
                            onClick={() => setConfirmingId(null)}
                            disabled={cancellingId === b.id}
                          >
                            Keep it
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn-ghost btn-danger"
                        onClick={() => setConfirmingId(b.id)}
                        aria-label={`Cancel session with ${b.mentor_name}, ${when}`}
                      >
                        Cancel session
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )
      )}
    </div>
  );
}
