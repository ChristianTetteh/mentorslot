-- Migration 003: basic sanity CHECKs the application already assumes.
--
-- Each is added NOT VALID first (enforced for new and changed rows straight
-- away, without scanning or rejecting existing data) and then validated only
-- if the existing rows pass, so a stray legacy row can never block a deploy.

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('bookings', 'bookings_end_after_start', 'end_time > start_time'),
      ('bookings', 'bookings_duration_allowed', 'duration_minutes IN (30, 45, 60)'),
      ('bookings', 'bookings_duration_matches', 'end_time - start_time = duration_minutes * interval ''1 minute'''),
      ('mentors', 'mentors_allowed_durations_valid', 'allowed_durations <@ ARRAY[30, 45, 60]::smallint[]')
    ) AS t(tbl, name, expr)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s) NOT VALID', c.tbl, c.name, c.expr);
    END IF;
    BEGIN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', c.tbl, c.name);
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'Existing rows violate %; it stays enforced for new rows only.', c.name;
    END;
  END LOOP;
END $$;
