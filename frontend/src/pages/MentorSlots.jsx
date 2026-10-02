import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import api from "../api";
import {
  groupSlotsByDay,
  timeLabel,
  timeRangeLabel,
  fullDateTimeRangeLabel,
  longDayLabel,
  viewerTimeZone,
  dateParts,
  initials,
} from "../utils/dates";
import { ChevronLeft, Close, Clock, Globe, Alert } from "../components/Icons.jsx";
import PrivateLink from "../components/PrivateLink.jsx";

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
  // The private manage link, held in memory only for this confirmation screen.
  const [manageLink, setManageLink] = useState("");
  const [emailed, setEmailed] = useState(false);

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
    setManageLink("");
    setEmailed(false);
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
      setManageLink(`${window.location.origin}/manage#${res.data.manage_token}`);
      setEmailed(res.data.emailed === true);
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

  const timeZone = viewerTimeZone();

  if (loadError) {
    return (
      <div className="page">
        <div className="error-banner inline-error" role="alert">
          <Alert />
          <p>{loadError}</p>
          <button className="btn-ghost" onClick={() => { setLoadError(""); loadSlots(DEFAULT_DURATION, { first: true }); }}>
            Try again
          </button>
          <Link to="/" className="btn-ghost">Back to fields</Link>
        </div>
      </div>
    );
  }
  if (!mentor) {
    return (
      <div className="page" role="status" aria-label="Loading mentor">
        <span className="sr-only">Loading…</span>
        <div aria-hidden="true">
          <div className="page-head mentor-head">
            <span className="skeleton avatar avatar-lg" />
            <div style={{ flex: 1 }}>
              <span className="skeleton skeleton-line" style={{ width: "55%", height: 30 }} />
              <span className="skeleton skeleton-line" style={{ width: "35%", marginTop: 10 }} />
            </div>
          </div>
          <div className="slot-grid">
            {Array.from({ length: 6 }, (_, i) => <span className="skeleton slot-skeleton" key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (confirmedBooking) {
    const parts = dateParts(confirmedBooking.start_time);
    return (
      <div className="page page-narrow">
        <div className="ticket" style={{ "--c": mentor.color }}>
          <div className="ticket-main">
            <div className="stamp-ticket-stamp">Confirmed</div>
            <p className="ticket-label">Your {confirmedBooking.duration_minutes}-minute session with</p>
            <h2 className="ticket-mentor">{confirmedBooking.mentor_name}</h2>
            <p className="ticket-when">
              {fullDateTimeRangeLabel(confirmedBooking.start_time, confirmedBooking.end_time)}
            </p>
            {timeZone && (
              <p className="tz-note"><Globe /> Times shown in {timeZone}</p>
            )}
          </div>
          <div className="ticket-perf" aria-hidden="true" />
          <div className="ticket-stub">
            <div className="date-block" aria-hidden="true">
              <span className="date-block-weekday">{parts.weekday}</span>
              <span className="date-block-day">{parts.day}</span>
              <span className="date-block-month">{parts.month}</span>
            </div>
            <div className="ticket-notes">
              <p>
                Booked under <strong className="break-word">{confirmedBooking.mentee_email}</strong>.
              </p>
            </div>
            <div className="ticket-link">
              <PrivateLink link={manageLink} emailed={emailed} />
            </div>
          </div>
        </div>
        <div className="ticket-actions">
          <Link to={{ pathname: "/manage", hash: manageLink.split("#")[1] }} className="btn-primary">Manage this booking</Link>
          <Link to="/" className="btn-ghost">Book another mentor</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="slots-layout" style={{ "--c": mentor.color }}>
        <div className="area-back">
          {mentor.field_id ? (
            <Link to={`/fields/${mentor.field_id}`} className="back-link"><ChevronLeft /> Back to mentors</Link>
          ) : (
            <Link to="/" className="back-link"><ChevronLeft /> Back to fields</Link>
          )}
        </div>

        <section className="page-head mentor-head area-head">
          <span className="avatar avatar-lg" aria-hidden="true">{initials(mentor.name)}</span>
          <div>
            <h1>{mentor.name}</h1>
            <p className="page-head-sub">{mentor.title}</p>
          </div>
        </section>

        <div className="area-duration">
          <p className="control-label" id="duration-label"><Clock /> Session length</p>
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
                  {!offered && <span className="duration-pill-note">Not offered</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="area-slots">
          {slotNotice && (
            <p className="error-banner" role="alert"><Alert /><span>{slotNotice}</span></p>
          )}

          {slotsError ? (
            <div className="error-banner inline-error" role="alert">
              <Alert />
              <p>{slotsError}</p>
              <button className="btn-ghost" onClick={() => loadSlots(duration)}>Try again</button>
            </div>
          ) : slotsLoading ? (
            <div role="status" aria-label="Loading availability">
              <span className="sr-only">Loading availability…</span>
              <div aria-hidden="true">
                <div className="day-tabs">
                  {[0, 1, 2].map((i) => <span className="skeleton day-skeleton" key={i} />)}
                </div>
                <div className="slot-grid">
                  {Array.from({ length: 8 }, (_, i) => <span className="skeleton slot-skeleton" key={i} />)}
                </div>
              </div>
            </div>
          ) : days.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">No open times for a {duration}-minute session.</p>
              <p className="muted">
                {offeredDurations.length > 1
                  ? "Try a different session length, or check back soon."
                  : "Check back soon, or browse other mentors."}
              </p>
              <Link to={mentor.field_id ? `/fields/${mentor.field_id}` : "/"} className="btn-ghost">
                Browse other mentors
              </Link>
            </div>
          ) : (
            <>
              <div className="slots-head">
                <p className="control-label">Pick a day</p>
                {timeZone && <p className="tz-note"><Globe /> Times in {timeZone}</p>}
              </div>
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

              <h2 className="slots-day-heading">
                {longDayLabel(currentDay.slots[0].start_time)}
                <span className="slots-day-count">
                  {currentDay.slots.length} open {currentDay.slots.length === 1 ? "time" : "times"}
                </span>
              </h2>

              <ul className="slot-grid">
                {currentDay?.slots.map((slot) => (
                  <li key={slot.start_time}>
                    <button
                      className={`slot ${selectedSlot?.start_time === slot.start_time ? "is-selected" : ""}`}
                      aria-label={`Book ${currentDay.label}, ${timeRangeLabel(slot.start_time, slot.end_time)}`}
                      aria-pressed={selectedSlot?.start_time === slot.start_time}
                      onClick={() => pickSlot(slot)}
                    >
                      <span className="slot-start">{timeLabel(slot.start_time)}</span>
                      <span className="slot-end">to {timeLabel(slot.end_time)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {selectedSlot && (
          <div className="confirm-panel area-panel" ref={panelRef} tabIndex={-1} role="region" aria-label="Confirm your booking">
            <button className="confirm-panel-close" onClick={() => setSelectedSlot(null)} aria-label="Change time">
              <Close />
            </button>
            <p className="confirm-panel-label">{duration}-minute session with {mentor.name}</p>
            <p className="confirm-panel-when">{fullDateTimeRangeLabel(selectedSlot.start_time, selectedSlot.end_time)}</p>
            {timeZone && <p className="tz-note"><Globe /> {timeZone}</p>}
            <form onSubmit={confirmBooking} className="confirm-form">
              <label>
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ama Serwaa" autoComplete="name" />
              </label>
              <label>
                Your email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
              {formError && <p className="form-error" role="alert"><Alert /> {formError}</p>}
              <button className="btn-primary btn-block" type="submit" disabled={busy}>
                {busy ? "Booking…" : "Confirm booking"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
