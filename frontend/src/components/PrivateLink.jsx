import { useEffect, useRef, useState } from "react";
import { Copy, Check, Lock } from "./Icons.jsx";

// The booking's private manage link: a read-only field, a Copy button with a
// visible "Copied" state (and a screen-reader announcement), and the warning
// that anyone holding the link can cancel. The link lives in memory only;
// it is never written to storage.
export default function PrivateLink({ link, emailed }) {
  const inputRef = useRef(null);
  const timer = useRef(null);
  const [state, setState] = useState("idle"); // idle | copied | failed

  useEffect(() => () => clearTimeout(timer.current), []);

  function flash(next) {
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 3500);
  }

  async function copy() {
    const input = inputRef.current;
    try {
      await navigator.clipboard.writeText(link);
      flash("copied");
      return;
    } catch {
      // Clipboard API unavailable (older browser, insecure context): fall back below.
    }
    try {
      input.focus();
      input.select();
      flash(document.execCommand("copy") ? "copied" : "failed");
    } catch {
      input?.select();
      flash("failed");
    }
  }

  const copied = state === "copied";
  return (
    <section className="private-link" aria-labelledby="private-link-label">
      <label className="private-link-label" id="private-link-label" htmlFor="private-link-field">
        <Lock /> Your private link
      </label>
      <div className="copy-row">
        <input
          id="private-link-field"
          ref={inputRef}
          type="text"
          readOnly
          value={link}
          spellCheck={false}
          autoComplete="off"
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className={`btn-ghost copy-btn ${copied ? "is-copied" : ""}`} onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className="private-link-note">
        Save this link. Anyone who has it can cancel this booking.
        {emailed && " We've also emailed it to you."}
      </p>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Link copied to the clipboard." : state === "failed" ? "Couldn't copy automatically. The link is selected: press Ctrl+C or long-press to copy." : ""}
      </span>
      {state === "failed" && (
        <p className="form-error" aria-hidden="true">Couldn't copy automatically. The link is selected: copy it by hand.</p>
      )}
    </section>
  );
}
