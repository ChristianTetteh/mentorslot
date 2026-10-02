import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { ChevronRight, Alert } from "../components/Icons.jsx";

export default function FieldList() {
  const [fields, setFields] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/fields")
      .then((res) => setFields(res.data.fields))
      .catch(() => setError("Couldn't load fields. Try refreshing the page."));
  }, []);

  return (
    <div className="page">
      <section className="hero">
        <h1 className="hero-title">Book time with a mentor.</h1>
        <p className="hero-sub">
          Pick a field to see who's available, choose an open slot, and confirm. No account
          needed.
        </p>
        <ol className="hero-steps" aria-label="How booking works">
          <li>Choose a field</li>
          <li>Pick an open time</li>
          <li>Confirm with your email</li>
        </ol>
      </section>

      <h2 className="section-title">Fields</h2>

      {error && (
        <p className="error-banner" role="alert">
          <Alert />
          <span>{error}</span>
        </p>
      )}

      {!fields && !error && (
        <div className="field-list" role="status" aria-label="Loading fields">
          <span className="sr-only">Loading fields…</span>
          {Array.from({ length: 6 }, (_, i) => (
            <div className="field-row skeleton-row" key={i} aria-hidden="true">
              <span className="field-row-swatch skeleton" />
              <span className="skeleton skeleton-line" style={{ width: `${48 + ((i * 13) % 30)}%` }} />
            </div>
          ))}
        </div>
      )}

      {fields && (
        <ul className="field-list">
          {fields.map((field) => (
            <li key={field.id}>
              <Link to={`/fields/${field.id}`} className="field-row" style={{ "--c": field.color }}>
                <span className="field-row-swatch" aria-hidden="true" />
                <span className="field-row-text">
                  <span className="field-row-name">{field.name}</span>
                  <span className="field-row-count">
                    {field.mentor_count} {field.mentor_count === 1 ? "mentor" : "mentors"}
                  </span>
                </span>
                <ChevronRight className="field-row-chevron" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
