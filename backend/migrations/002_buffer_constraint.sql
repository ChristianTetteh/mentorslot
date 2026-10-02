-- Migration 002: enforce the 15-minute buffer between a mentor's sessions in
-- the database, regardless of the mix of session lengths.
--
-- The original EXCLUDE constraint compared the raw [start, end) ranges, so a
-- 09:45-10:15 session and a 10:15-11:15 session could sit back to back. This
-- swaps it for one over a *padded* range, [start, end + 15 minutes): two
-- bookings for the same mentor conflict unless they are at least 15 minutes
-- apart. (Padding one side only gives a 15-minute minimum gap; padding both
-- sides would demand 30.) Keep the 15 in sync with BUFFER_MINUTES in
-- lib/schedule.js.

-- Index expressions must be IMMUTABLE. `timestamptz + interval` is only STABLE
-- in general (day/month intervals depend on the session time zone), but a
-- fixed number of minutes does not, so wrapping it is safe.
CREATE OR REPLACE FUNCTION booking_blocked_range(s timestamptz, e timestamptz)
RETURNS tstzrange
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT tstzrange(s, e + interval '15 minutes') $$;

DO $$
DECLARE
  too_close integer;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_bookings_buffered') THEN
    RETURN;
  END IF;

  -- Existing rows must satisfy the stricter rule or the constraint can't be
  -- built. Fail loudly (and roll back) rather than silently skip or delete data.
  SELECT count(*) INTO too_close
  FROM bookings a
  JOIN bookings b ON a.mentor_id = b.mentor_id AND a.id < b.id
   AND booking_blocked_range(a.start_time, a.end_time) && booking_blocked_range(b.start_time, b.end_time);
  IF too_close > 0 THEN
    RAISE EXCEPTION 'Cannot add the 15-minute buffer constraint: % pair(s) of existing bookings for the same mentor are less than 15 minutes apart. Cancel or move one of each pair, then re-run the migration.', too_close;
  END IF;

  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_overlapping_bookings;
  ALTER TABLE bookings
    ADD CONSTRAINT no_overlapping_bookings_buffered
    EXCLUDE USING gist (mentor_id WITH =, booking_blocked_range(start_time, end_time) WITH &&);
END $$;
