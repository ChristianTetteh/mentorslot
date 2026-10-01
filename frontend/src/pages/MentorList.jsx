import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api";

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
        ← All fields
      </Link>

      {error && <p className="error-banner">{error}</p>}

      {!field && !error && <p className="muted">Loading mentors…</p>}

      {field && (
        <section className="mentor-header" style={{ "--mentor-color": field.color }}>
          <h1>{field.name}</h1>
          <p className="mentor-header-title">
            {mentors.length} {mentors.length === 1 ? "mentor" : "mentors"} in this field
          </p>
        </section>
      )}

      {mentors && mentors.length === 0 && (
        <p className="muted">No mentors in this field yet. Check back soon.</p>
      )}

      <div className="mentor-grid">
        {mentors?.map((mentor) => (
          <Link to={`/mentors/${mentor.id}`} key={mentor.id} className="mentor-card">
            <span className="mentor-card-tab" style={{ background: mentor.color }} aria-hidden="true" />
            <div className="mentor-card-body">
              <h2 className="mentor-card-name">{mentor.name}</h2>
              <p className="mentor-card-title">{mentor.title}</p>
              <p className="mentor-card-bio">{mentor.bio}</p>
              <span className="mentor-card-cta">View open times</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
