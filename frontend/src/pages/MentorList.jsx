import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";

export default function MentorList() {
  const [mentors, setMentors] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/mentors")
      .then((res) => setMentors(res.data.mentors))
      .catch(() => setError("Couldn't load mentors. Try refreshing the page."));
  }, []);

  return (
    <div className="page">
      <section className="hero">
        <h1 className="hero-title">Book time with a mentor.</h1>
        <p className="hero-sub">
          Pick someone whose work you want to learn from, choose an open slot, and confirm.
          No account needed.
        </p>
      </section>

      {error && <p className="error-banner">{error}</p>}

      {!mentors && !error && <p className="muted">Loading mentors…</p>}

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
