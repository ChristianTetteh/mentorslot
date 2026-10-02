-- MentorSlot initial schema (migration 001).
--
-- Written in CREATE ... IF NOT EXISTS style with no DROPs, so applying it to a
-- database that already has this schema (the original deployment, created by
-- the old schema.sql) changes nothing. It never removes tables, columns or rows.

-- Needed for the EXCLUDE constraint below: lets a GiST index enforce equality
-- (mentor_id) alongside a range-overlap check in the same constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A field is a broad profession/career category (Tech & IT, Healthcare, Law, ...).
-- Mentors belong to exactly one field; the homepage browses fields first, then
-- the mentors within one, rather than one flat list of every mentor.
CREATE TABLE IF NOT EXISTS fields (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#2F5233',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mentors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  bio TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6C63FF',
  field_id INTEGER REFERENCES fields(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added after the first release, so existing deployments need the column
-- added explicitly rather than relying on CREATE TABLE IF NOT EXISTS above.
ALTER TABLE mentors ADD COLUMN IF NOT EXISTS field_id INTEGER REFERENCES fields(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_mentors_field ON mentors (field_id);
-- Lets seed.js upsert mentors by name instead of duplicating them on every boot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mentors_name ON mentors (name);

-- Which session lengths (minutes) a mentor offers. 30 is always included by
-- convention (seed.js enforces this) so there's always a default that works.
ALTER TABLE mentors ADD COLUMN IF NOT EXISTS allowed_durations SMALLINT[] NOT NULL DEFAULT '{30}';

-- Availability is not stored: variable session lengths (30/45/60 min) mean "is
-- this mentor free" is computed on request (routes/mentors.js) from business
-- hours minus this table's rows.

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  mentor_id INTEGER NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  mentee_name TEXT NOT NULL,
  mentee_email TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings (mentee_email);
CREATE INDEX IF NOT EXISTS idx_bookings_mentor_time ON bookings (mentor_id, start_time);

-- THE double-booking / overlap guard. Postgres itself refuses to let two
-- bookings for the same mentor exist with overlapping [start_time, end_time)
-- ranges, however those ranges are shaped — a 60-minute booking at 9:00
-- collides with a 30-minute booking at 9:15 just as surely as two identical
-- 9:00 bookings would, because this is a genuine interval-overlap check, not
-- a same-slot check. It is enforced atomically on INSERT by the database's
-- own index, the same way a UNIQUE constraint is: no application-level
-- locking or transaction choreography is needed for correctness here (see
-- routes/bookings.js). A violation raises Postgres error code 23P01, which
-- the API turns into a 409.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_bookings'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT no_overlapping_bookings
      EXCLUDE USING gist (mentor_id WITH =, tstzrange(start_time, end_time) WITH &&);
  END IF;
END $$;
