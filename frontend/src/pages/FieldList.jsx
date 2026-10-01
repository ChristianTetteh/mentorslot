import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";

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
      </section>

      {error && <p className="error-banner">{error}</p>}

      {!fields && !error && <p className="muted">Loading fields…</p>}

      <div className="mentor-grid">
        {fields?.map((field) => (
          <Link to={`/fields/${field.id}`} key={field.id} className="mentor-card field-card">
            <span className="mentor-card-tab" style={{ background: field.color }} aria-hidden="true" />
            <div className="mentor-card-body">
              <h2 className="mentor-card-name">{field.name}</h2>
              <p className="field-card-count">
                {field.mentor_count} {field.mentor_count === 1 ? "mentor" : "mentors"}
              </p>
              <span className="mentor-card-cta">Browse mentors</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
