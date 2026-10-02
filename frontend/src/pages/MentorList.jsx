import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api";
import { initials } from "../utils/dates";
import { ChevronLeft, ChevronRight, Alert } from "../components/Icons.jsx";

export default function MentorList() {
  const { fieldId } = useParams();
  const [field, setField] = useState(null);
  const [mentors, setMentors] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setField(null);
    setMentors(null);
    setError("");
    api
      .get(`/fields/${fieldId}/mentors`)
      .then((res) => {
        setField(res.data.field);
        setMentors(res.data.mentors);
      })
      .catch((err) => {
        if (err.response?.status === 404) {
          setError("That field doesn't exist.");
        } else {
          setError("Couldn't load mentors. Try refreshing the page.");
        }
      });
  }, [fieldId]);

  return (
    <div className="page">
      <Link to="/" className="back-link">
        <ChevronLeft /> All fields
      </Link>

      {error && (
        <div className="error-banner inline-error" role="alert">
          <Alert />
          <p>{error}</p>
          <Link to="/" className="btn-ghost">Back to all fields</Link>
        </div>
      )}

      {!field && !error && (
        <div role="status" aria-label="Loading mentors">
          <span className="sr-only">Loading mentors…</span>
          <div className="page-head" aria-hidden="true">
            <span className="skeleton skeleton-line" style={{ width: "55%", height: 32 }} />
            <span className="skeleton skeleton-line" style={{ width: "30%", marginTop: 10 }} />
          </div>
          <div className="mentor-grid" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div className="mentor-card skeleton-card" key={i}>
                <span className="skeleton avatar" />
                <div className="mentor-card-body">
                  <span className="skeleton skeleton-line" style={{ width: "60%" }} />
                  <span className="skeleton skeleton-line" style={{ width: "40%" }} />
                  <span className="skeleton skeleton-line" style={{ width: "95%", marginTop: 10 }} />
                  <span className="skeleton skeleton-line" style={{ width: "80%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {field && (
        <section className="page-head field-head" style={{ "--c": field.color }}>
          <span className="field-head-swatch" aria-hidden="true" />
          <div>
            <h1>{field.name}</h1>
            <p className="page-head-sub">
              {mentors.length} {mentors.length === 1 ? "mentor" : "mentors"} in this field
            </p>
          </div>
        </section>
      )}

      {mentors && mentors.length === 0 && (
        <div className="empty-state">
          <p className="empty-state-title">No mentors in this field yet.</p>
          <p className="muted">New mentors join regularly. Meanwhile, you can browse another field.</p>
          <Link to="/" className="btn-primary">Browse other fields</Link>
        </div>
      )}

      {mentors && mentors.length > 0 && (
        <ul className="mentor-grid">
          {mentors.map((mentor) => (
            <li key={mentor.id}>
              <Link to={`/mentors/${mentor.id}`} className="mentor-card" style={{ "--c": mentor.color }}>
                <span className="avatar" aria-hidden="true">{initials(mentor.name)}</span>
                <div className="mentor-card-body">
                  <h2 className="mentor-card-name">{mentor.name}</h2>
                  <p className="mentor-card-title">{mentor.title}</p>
                  <p className="mentor-card-bio">{mentor.bio}</p>
                  <span className="mentor-card-cta">
                    See open times <ChevronRight />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
