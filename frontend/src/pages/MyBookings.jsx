import { useEffect, useState } from "react";
import api from "../api";
import { fullDateTimeRangeLabel } from "../utils/dates";

const LAST_EMAIL_KEY = "mentorslot_last_email";

export default function MyBookings() {
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState(null);

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
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't cancel that booking. Try again.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">My bookings</h1>
      <p className="hero-sub">
        Since there's no account, enter the email you booked with to see or cancel a session.
      </p>

      <form
        className="lookup-form"
        onSubmit={(e) => {
          e.preventDefault();
          lookUp();
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email you booked with"
        />
        <button className="btn-primary" type="submit">
          Find my bookings
        </button>
      </form>

      {error && <p className="error-banner" role="alert">{error}</p>}

      {bookings && (
        bookings.length === 0 ? (
          <p className="muted">No bookings found for that email.</p>
        ) : (
          <ul className="booking-list">
            {bookings.map((b) => (
              <li key={b.id} className="booking-row" style={{ "--mentor-color": b.color }}>
                <div>
                  <p className="booking-row-mentor">
                    {b.mentor_name} <span className="booking-row-duration">· {b.duration_minutes} min</span>
                  </p>
                  <p className="booking-row-when">{fullDateTimeRangeLabel(b.start_time, b.end_time)}</p>
                </div>
                <button
                  className="btn-ghost btn-danger"
                  onClick={() => cancel(b.id)}
                  disabled={cancellingId === b.id}
                >
                  {cancellingId === b.id ? "Cancelling…" : "Cancel"}
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
