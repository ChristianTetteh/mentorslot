import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api";
import { groupSlotsByDay, timeLabel, fullDateTimeLabel } from "../utils/dates";

export default function MentorSlots() {
  const { id } = useParams();
  const [mentor, setMentor] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [activeDay, setActiveDay] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  useEffect(() => {
    api
      .get(`/mentors/${id}/slots`)
      .then((res) => {
        setMentor(res.data.mentor);
        setSlots(res.data.slots);
      })
      .catch(() => setLoadError("Couldn't load this mentor's availability. Try again."));
  }, [id]);

  const days = groupSlotsByDay(slots);
  const currentDayKey = activeDay || days[0]?.key;
  const currentDay = days.find((d) => d.key === currentDayKey);

  function pickSlot(slot) {
    setSelectedSlot(slot);
    setFormError("");
  }

  async function confirmBooking(e) {
    e.preventDefault();
    setFormError("");
    if (name.trim().length < 2) {
      setFormError("Enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError("Enter a valid email.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post("/bookings", { slot_id: selectedSlot.id, name, email });
      setConfirmedBooking(res.data.booking);
      setSlots((prev) => prev.filter((s) => s.id !== selectedSlot.id));
      setSelectedSlot(null);
    } catch (err) {
      const message = err.response?.data?.error || "Couldn't complete the booking. Try again.";
      setFormError(message);
      if (err.response?.status === 409) {
        // Someone else took it first — drop it from the list so it can't be retried.
        setSlots((prev) => prev.filter((s) => s.id !== selectedSlot.id));
        setSelectedSlot(null);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <div className="page"><p className="error-banner">{loadError}</p></div>;
  if (!mentor) return <div className="page"><p className="muted">Loading…</p></div>;

  if (confirmedBooking) {
    return (
      <div className="page">
        <div className="stamp-ticket">
          <div className="stamp-ticket-stamp">Confirmed</div>
          <p className="stamp-ticket-label">Your session with</p>
          <h2 className="stamp-ticket-mentor">{confirmedBooking.mentor_name}</h2>
          <p className="stamp-ticket-when">{fullDateTimeLabel(confirmedBooking.start_time)}</p>
          <p className="stamp-ticket-note">
            Booked under {confirmedBooking.mentee_email}. You can look this session up or cancel it
            anytime from My bookings using that same email.
          </p>
          <div className="stamp-ticket-actions">
            <Link to="/my-bookings" className="btn-primary">View my bookings</Link>
            <Link to="/" className="btn-ghost">Book another mentor</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Link to={`/fields/${mentor.field_id}`} className="back-link">← Back to mentors</Link>

      <section className="mentor-header" style={{ "--mentor-color": mentor.color }}>
        <h1>{mentor.name}</h1>
        <p className="mentor-header-title">{mentor.title}</p>
      </section>

      {days.length === 0 ? (
        <p className="muted">No open times right now. Check back soon.</p>
      ) : (
        <>
          <div className="day-tabs">
            {days.map((d) => (
              <button
                key={d.key}
                className={`day-tab ${d.key === currentDayKey ? "is-active" : ""}`}
                onClick={() => {
                  setActiveDay(d.key);
                  setSelectedSlot(null);
                }}
              >
                {d.label}
              </button>
            ))}
          </div>

          <ul className="ledger">
            {currentDay?.slots.map((slot) => (
              <li key={slot.id} className="ledger-row">
                <span className="ledger-time">{timeLabel(slot.start_time)}</span>
                <span className="ledger-rule" aria-hidden="true" />
                <button className="ledger-book-btn" onClick={() => pickSlot(slot)}>
                  Book
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {selectedSlot && (
        <div className="confirm-panel">
          <button className="confirm-panel-close" onClick={() => setSelectedSlot(null)} aria-label="Change time">
            ×
          </button>
          <p className="confirm-panel-label">Booking with {mentor.name}</p>
          <p className="confirm-panel-when">{fullDateTimeLabel(selectedSlot.start_time)}</p>
          <form onSubmit={confirmBooking} className="confirm-form">
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ama Serwaa" />
            </label>
            <label>
              Your email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            {formError && <p className="form-error">{formError}</p>}
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Booking…" : "Confirm booking"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
