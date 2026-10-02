import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import api from "../api";
import { fullDateTimeRangeLabel, dateParts, viewerTimeZone } from "../utils/dates";
import { Globe, Alert } from "../components/Icons.jsx";

// The private link is /manage#<token>. The token lives in the URL fragment so
// it is never sent to any server. We read it once, then take it out of the
// address bar (and so out of history entries, screenshots and shoulder-surfing)
// and keep it in memory only.
function takeTokenFromHash() {
  const raw = window.location.hash.replace(/^#/, "").trim();
  if (!raw) return null;
  try {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  } catch {
    // history unavailable: the token stays visible but still works
  }
  return raw;
}

const STATUS_LABEL = { upcoming: "Upcoming", started: "Started", past: "Finished" };

export default function Manage() {
  // loading | ready | missing | notfound | error | cancelled
  const [phase, setPhase] = useState("loading");
  const [token, setToken] = useState(null);
  const [booking, setBooking] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const captured = useRef(false);
  const headingRef = useRef(null);
  const confirmRef = useRef(null);
  const cancelBtnRef = useRef(null);

  // Read the token on arrival, and again if a different link is opened while
  // this page is already showing (a hash-only navigation doesn't reload).
  useEffect(() => {
    function capture() {
      const t = takeTokenFromHash();
      if (t) {
        captured.current = true;
        setBooking(null);
        setConfirming(false);
        setCancelError("");
        setPhase("loading");
        setToken(t);
      } else if (!captured.current) {
        setPhase("missing");
      }
    }
    capture();
    window.addEventListener("hashchange", capture);
    return () => window.removeEventListener("hashchange", capture);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    setPhase("loading");
    api
      .post("/manage/view", { token }, { signal: controller.signal })
      .then((res) => {
        setBooking(res.data.booking);
        setPhase("ready");
      })
      .catch((err) => {
        if (axios.isCancel(err)) return;
        const status = err.response?.status;
        setPhase(status === 404 || status === 400 ? "notfound" : "error");
      });
    return () => controller.abort();
  }, [token, attempt]);

  // Land screen-reader and keyboard users on the new state's heading.
  useEffect(() => {
    if (phase !== "loading") headingRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const cancel = useCallback(async () => {
    setCancelling(true);
    setCancelError("");
    try {
      await api.post("/manage/cancel", { token });
      setToken(null); // done with it: don't keep a working credential in memory
      setConfirming(false);
      setPhase("cancelled");
    } catch (err) {
      const status = err.response?.status;
      setConfirming(false);
      if (status === 409) {
        setBooking((b) => ({ ...b, status: "started" }));
      } else if (status === 404) {
        setPhase("notfound");
      } else {
        setCancelError(err.response?.data?.error || "Couldn't cancel that booking. Try again.");
      }
    } finally {
      setCancelling(false);
    }
  }, [token]);

  const timeZone = viewerTimeZone();

  if (phase === "loading") {
    return (
      <div className="page page-narrow" role="status" aria-label="Loading your booking">
        <span className="sr-only">Loading your booking…</span>
        <div aria-hidden="true" className="ticket">
          <div className="ticket-main">
            <span className="skeleton skeleton-line" style={{ width: "40%", height: 40, margin: "0 auto 16px" }} />
            <span className="skeleton skeleton-line" style={{ width: "55%", height: 30, margin: "0 auto" }} />
            <span className="skeleton skeleton-line" style={{ width: "70%", margin: "12px auto 0" }} />
          </div>
        </div>
      </div>
    );
  }

  if (phase === "missing" || phase === "notfound") {
    const missing = phase === "missing";
    return (
      <div className="page page-narrow">
        <div className="empty-state">
          <h1 className="empty-state-title" tabIndex={-1} ref={headingRef}>
            {missing ? "This link is missing its booking code." : "We can't find that booking."}
          </h1>
          <p className="muted">
            {missing
              ? "Open the full private link from your confirmation, or ask for your links to be emailed again."
              : "The link may be incomplete or out of date, or the booking was already cancelled."}
          </p>
          <div className="empty-state-actions">
            <Link to="/my-bookings" className="btn-primary">Find my bookings</Link>
            <Link to="/" className="btn-ghost">Browse mentors</Link>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="page page-narrow">
        <div className="error-banner inline-error" role="alert">
          <Alert />
          <p>
            <strong tabIndex={-1} ref={headingRef}>Couldn't load your booking.</strong> Check your connection and try again.
          </p>
          <button className="btn-ghost" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      </div>
    );
  }

  const parts = dateParts(booking.start_time);
  const when = fullDateTimeRangeLabel(booking.start_time, booking.end_time);

  if (phase === "cancelled") {
    return (
      <div className="page page-narrow">
        <div className="ticket is-cancelled" style={{ "--c": booking.mentor_color }}>
          <div className="ticket-main">
            <div className="stamp-ticket-stamp is-danger">Cancelled</div>
            <h1 className="ticket-mentor" tabIndex={-1} ref={headingRef}>Session cancelled</h1>
            <p className="ticket-label">Your {booking.duration_minutes}-minute session with {booking.mentor_name}</p>
            <p className="ticket-when">{when}</p>
            <p className="ticket-label">That time is open again for other people to book.</p>
          </div>
        </div>
        <div className="ticket-actions">
          <Link to="/" className="btn-primary">Book another mentor</Link>
        </div>
      </div>
    );
  }

  const upcoming = booking.status === "upcoming";
  return (
    <div className="page page-narrow">
      <div className={`ticket is-${booking.status}`} style={{ "--c": booking.mentor_color }}>
        <div className="ticket-main">
          <div className={`stamp-ticket-stamp ${upcoming ? "" : "is-muted"}`}>{STATUS_LABEL[booking.status]}</div>
          <p className="ticket-label">Your {booking.duration_minutes}-minute session with</p>
          <h1 className="ticket-mentor" tabIndex={-1} ref={headingRef}>{booking.mentor_name}</h1>
          <p className="ticket-label">{booking.mentor_title}</p>
          <p className="ticket-when">{when}</p>
          {timeZone && <p className="tz-note"><Globe /> Times shown in {timeZone}</p>}
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
              Booked by <strong className="break-word">{booking.mentee_first_name || "you"}</strong>
              {" "}(<span className="break-word">{booking.mentee_email_masked}</span>)
            </p>
          </div>
        </div>
      </div>

      {cancelError && (
        <p className="error-banner" role="alert"><Alert /><span>{cancelError}</span></p>
      )}

      {upcoming ? (
        confirming ? (
          <div className="cancel-confirm" role="group" aria-labelledby="cancel-confirm-title" tabIndex={-1} ref={confirmRef}>
            <p id="cancel-confirm-title"><strong>Cancel this session?</strong></p>
            <p>The time goes back to {booking.mentor_name}'s open slots. This can't be undone.</p>
            <div className="cancel-confirm-actions">
              <button className="btn-danger-solid" onClick={cancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Yes, cancel session"}
              </button>
              <button
                className="btn-ghost"
                disabled={cancelling}
                onClick={() => {
                  setConfirming(false);
                  setTimeout(() => cancelBtnRef.current?.focus(), 0);
                }}
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div className="ticket-actions">
            <button className="btn-ghost btn-danger" ref={cancelBtnRef} onClick={() => setConfirming(true)}>
              Cancel this session
            </button>
            <Link to="/" className="btn-ghost">Browse mentors</Link>
          </div>
        )
      ) : (
        <>
          <p className="notice-box" role="status">
            {booking.status === "started"
              ? "This session has already started, so it can't be cancelled."
              : "This session has finished, so there's nothing left to cancel."}
          </p>
          <div className="ticket-actions">
            <Link to="/" className="btn-primary">Book another mentor</Link>
          </div>
        </>
      )}
    </div>
  );
}
