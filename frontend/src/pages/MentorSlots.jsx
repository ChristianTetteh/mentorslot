import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api";
import { groupSlotsByDay, timeRangeLabel, fullDateTimeRangeLabel } from "../utils/dates";

const ALL_DURATIONS = [30, 45, 60];
const DEFAULT_DURATION = 30;

export default function MentorSlots() {
  const { id } = useParams();
  const [mentor, setMentor] = useState(null);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [slots, setSlots] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [activeDay, setActiveDay] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // First load: fetch the mentor (via the default-duration slots call, which
  // returns both) so we know which durations this mentor actually offers.
  useEffect(() => {
    api
      .get(`/mentors/${id}/slots`, { params: { duration: DEFAULT_DURATION } })
      .then((res) => {
        setMentor(res.data.mentor);
        setDuration(res.data.duration);
        setSlots(res.data.slots);
        setSlotsLoading(false);
      })
      .catch(() => {
        setLoadError("Couldn't load this mentor's availability. Try again.");
        setSlotsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Re-fetch whenever the chosen duration changes (after the first load).
  function changeDuration(nextDuration) {
    if (nextDuration === duration) return;
    setDuration(nextDuration);
    setSlotsLoading(true);
    setSelectedSlot(null);
    setActiveDay(null);
    api
      .get(`/mentors/${id}/slots`, { params: { duration: nextDuration } })
      .then((res) => {
        setSlots(res.data.slots);
        setSlotsLoading(false);
      })
      .catch(() => {
        setLoadError("Couldn't load availability for that session length. Try again.");
        setSlotsLoading(false);
      });
  }

  const days = groupSlotsByDay(slots);
  const currentDayKey = activeDay || days[0]?.key;
  const currentDay = days.find((d) => d.key === currentDayKey);
  const offeredDurations = mentor?.allowed_durations || ALL_DURATIONS;

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
      const res = await api.post("/bookings", {
        mentor_id: mentor.id,
        start_time: selectedSlot.start_time,
        duration,
        name,
        email,
      });
      setConfirmedBooking(res.data.booking);
      setSlots((prev) => prev.filter((s) => s.start_time !== selectedSlot.start_time));
      setSelectedSlot(null);
    } catch (err) {
      const message = err.response?.data?.error || "Couldn't complete the booking. Try again.";
      setFormError(message);
      if (err.response?.status === 409) {
        // Someone else took an overlapping time first — drop it from the list so it can't be retried.
        setSlots((prev) => prev.filter((s) => s.start_time !== selectedSlot.start_time));
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
          <p className="stamp-ticket-label">Your {confirmedBooking.duration_minutes}-minute session with</p>
          <h2 className="stamp-ticket-mentor">{confirmedBooking.mentor_name}</h2>
          <p className="stamp-ticket-when">
            {fullDateTimeRangeLabel(confirmedBooking.start_time, confirmedBooking.end_time)}
          </p>
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

      <div className="duration-picker">
        {ALL_DURATIONS.map((d) => {
          const offered = offeredDurations.includes(d);
          return (
            <button
              key={d}
              className={`duration-pill ${d === duration ? "is-active" : ""}`}
              onClick={() => offered && changeDuration(d)}
              disabled={!offered}
              title={offered ? undefined : `${mentor.name} doesn't offer ${d}-minute sessions`}
            >
              {d} min
            </button>
          );
        })}
      </div>

      {slotsLoading ? (
        <p className="muted">Loading availability…</p>
      ) : days.length === 0 ? (
        <p className="muted">No open times right now for a {duration}-minute session. Check back soon or try a different length.</p>
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
              <li key={slot.start_time} className="ledger-row">
                <span className="ledger-time">{timeRangeLabel(slot.start_time, slot.end_time)}</span>
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
          <p className="confirm-panel-label">Booking a {duration}-minute session with {mentor.name}</p>
          <p className="confirm-panel-when">{fullDateTimeRangeLabel(selectedSlot.start_time, selectedSlot.end_time)}</p>
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
