import { Link, useLocation } from "react-router-dom";

export default function Header() {
  const location = useLocation();
  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="26" height="26">
            <rect x="3" y="6" width="26" height="23" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="3" y1="12" x2="29" y2="12" stroke="currentColor" strokeWidth="2" />
            <line x1="9" y1="3" x2="9" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="23" y1="3" x2="23" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="9.5" cy="18" r="1.6" fill="currentColor" />
            <circle cx="16" cy="18" r="1.6" fill="currentColor" />
            <circle cx="9.5" cy="23.5" r="1.6" fill="currentColor" />
          </svg>
        </span>
        MentorSlot
      </Link>
      <nav className="site-nav">
        <Link
          to="/"
          className={location.pathname === "/" || location.pathname.startsWith("/fields") ? "is-active" : ""}
        >
          Browse fields
        </Link>
        <Link to="/my-bookings" className={location.pathname === "/my-bookings" ? "is-active" : ""}>
          My bookings
        </Link>
      </nav>
    </header>
  );
}
