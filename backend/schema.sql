-- MentorSlot schema. Safe to re-run (idempotent).

CREATE TABLE IF NOT EXISTS mentors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  bio TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6C63FF',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each row is one bookable time slot for one mentor. `status` is the fast
-- path for "is this slot open" (used for the atomic booking update below);
-- the UNIQUE constraint on bookings.slot_id is the hard, DB-enforced
-- guarantee that backs it up even under concurrent requests.
CREATE TABLE IF NOT EXISTS slots (
  id SERIAL PRIMARY KEY,
  mentor_id INTEGER NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mentor_id, start_time)
);

CREATE INDEX IF NOT EXISTS idx_slots_mentor_time ON slots (mentor_id, start_time);
CREATE INDEX IF NOT EXISTS idx_slots_status_time ON slots (status, start_time);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  -- UNIQUE here is the real double-booking guard: even if two requests race
  -- past the application-level check at the exact same instant, the second
  -- INSERT for the same slot_id is rejected by Postgres itself.
  slot_id INTEGER NOT NULL UNIQUE REFERENCES slots(id) ON DELETE CASCADE,
  mentor_id INTEGER NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  mentee_name TEXT NOT NULL,
  mentee_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings (mentee_email);
