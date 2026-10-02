import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
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
  const [slotsError, setSlotsError] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotNotice, setSlotNotice] = useState("");
  const [activeDay, setActiveDay] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  const panelRef = useRef(null);
  // Only the newest slots request may update state: each call aborts the
  // previous one and bumps `seq`, so a slow stale response is ignored.
  const request = useRef({ seq: 0, controller: null });
  const currentId = useRef(id);
  currentId.current = id;

  const loadSlots = useCallback(
    async (forDuration, { first = false, quiet = false } = {}) => {
      const req = request.current;
      req.controller?.abort();
      const controller = new AbortController();
      req.controller = controller;
      const seq = ++req.seq;
      if (!quiet) setSlotsLoading(true);
      setSlotsError("");
      try {
        const res = await api.get(`/mentors/${id}/slots`, {
          params: { duration: forDuration },
          signal: controller.signal,
        });
        if (seq !== req.seq) return;
        if (first) {
          setMentor(res.data.mentor);
          setDuration(res.data.duration);
        }
        setSlots(res.data.slots);
      } catch (err) {
        if (seq !== req.seq || axios.isCancel(err)) return;
        if (first) setLoadError("Couldn't load this mentor's availability.");
        else setSlotsError("Couldn't load availability for that session length.");
      }
      if (seq === req.seq) setSlotsLoading(false);
    },
    [id]
  );

  // Load on mount and whenever the route's mentor id changes (the component
  // stays mounted when navigating mentor -> mentor, so reset everything).
  // The first call fetches the mentor via the default-duration slots request,
  // which returns both, so we know which durations this mentor offers.
  useEffect(() => {
    setMentor(null);
    setDuration(DEFAULT_DURATION);
    setSlots([]);
    setLoadError("");
    setSlotsError("");
    setSlotNotice("");
    setSlotsLoading(true);
    setActiveDay(null);
    setSelectedSlot(null);
    setFormError("");
    setBusy(false);
    setConfirmedBooking(null);
    loadSlots(DEFAULT_DURATION, { first: true });
    const req = request.current;
    return () => {
      req.seq++;
      req.controller?.abort();
    };
  }, [id, loadSlots]);

  // Move focus into the confirm panel when it opens so keyboard and
  // screen-reader users land on the form they just asked for.
  useEffect(() => {
    if (selectedSlot) panelRef.current?.focus();
  }, [selectedSlot]);

  function changeDuration(nextDuration) {
    if (nextDuration === duration) return;
    setDuration(nextDuration);
    setSelectedSlot(null);
    setActiveDay(null);
    setSlotNotice("");
    setSlots([]);
    loadSlots(nextDuration);
  }

  const days = groupSlotsByDay(slots);
  const currentDayKey = days.some((d) => d.key === activeDay) ? activeDay : days[0]?.key;
  const currentDay = days.find((d) => d.key === currentDayKey);
  const offeredDurations = mentor?.allowed_durations || ALL_DURATIONS;

  function pickSlot(slot) {
    setSelectedSlot(slot);
    setFormError("");
    setSlotNotice("");
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
    const bookingFor = id;
    const slot = selectedSlot;
    setBusy(true);
    try {
      const res = await api.post("/bookings", {
        mentor_id: mentor.id,
        start_time: slot.start_time,
        duration,
        name,
        email,
      });
      if (currentId.current !== bookingFor) return;
      setConfirmedBooking(res.data.booking);
      setSelectedSlot(null);
    } catch (err) {
      if (currentId.current !== bookingFor) return;
      const message = err.response?.data?.error || "Couldn't complete the booking. Try again.";
      if (err.response?.status === 409) {
        // Someone else took an overlapping (or too-close) time first. Close the
        // form, say so where the list is, and refresh the whole list: other
        // nearby times may have gone too.
        setSelectedSlot(null);
        setSlotNotice(`${message} The list below has been refreshed.`);
        loadSlots(duration, { quiet: true });
      } else {
        setFormError(message);
      }
    } finally {
      if (currentId.current === bookingFor) setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="page">
        <div className="error-banner inline-error" role="alert">
          <p>{loadError}</p>
          <button className="btn-ghost" onClick={() => { setLoadError(""); loadSlots(DEFAULT_DURATION, { first: true }); }}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!mentor) return <div className="page"><p className="muted" role="status">Loading…</p></div>;

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
          <p className="stamp-ticket-note">
            This is a demo: no confirmation email is sent, so keep this screen's details.
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
      {mentor.field_id ? (
        <Link to={`/fields/${mentor.field_id}`} className="back-link">← Back to mentors</Link>
      ) : (
        <Link to="/" className="back-link">← Back to fields</Link>
      )}

      <section className="mentor-header" style={{ "--mentor-color": mentor.color }}>
        <h1>{mentor.name}</h1>
        <p className="mentor-header-title">{mentor.title}</p>
      </section>

      <div className="duration-picker" role="group" aria-label="Session length">
        {ALL_DURATIONS.map((d) => {
          const offered = offeredDurations.includes(d);
          return (
            <button
              key={d}
              className={`duration-pill ${d === duration ? "is-active" : ""}`}
              aria-pressed={d === duration}
              onClick={() => offered && changeDuration(d)}
              disabled={!offered}
              title={offered ? undefined : `${mentor.name} doesn't offer ${d}-minute sessions`}
            >
              {d} min
            </button>
          );
        })}
      </div>

      {slotNotice && <p className="error-banner" role="alert">{slotNotice}</p>}

      {slotsError ? (
        <div className="error-banner inline-error" role="alert">
          <p>{slotsError}</p>
          <button className="btn-ghost" onClick={() => loadSlots(duration)}>Retry</button>
        </div>
      ) : slotsLoading ? (
        <p className="muted" role="status">Loading availability…</p>
      ) : days.length === 0 ? (
        <p className="muted">No open times right now for a {duration}-minute session. Check back soon or try a different length.</p>
      ) : (
        <>
          <div className="day-tabs" role="group" aria-label="Day">
            {days.map((d) => (
              <button
                key={d.key}
                className={`day-tab ${d.key === currentDayKey ? "is-active" : ""}`}
                aria-pressed={d.key === currentDayKey}
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
                <button
                  className="ledger-book-btn"
                  aria-label={`Book ${currentDay.label}, ${timeRangeLabel(slot.start_time, slot.end_time)}`}
                  onClick={() => pickSlot(slot)}
                >
                  Book
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {selectedSlot && (
        <div className="confirm-panel" ref={panelRef} tabIndex={-1} role="region" aria-label="Confirm your booking">
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
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Booking…" : "Confirm booking"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
