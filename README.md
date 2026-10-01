# MentorSlot — book time with a mentor.

A full-stack booking/scheduling app built for the "Simple Booking/Scheduling App" intern
task: **React + Node/Express + PostgreSQL**, deployed, tested, and built with a genuine
(not cosmetic) double-booking guard.

**Live demo:** https://mentorslot.vercel.app
**API:** https://mentorslot-backend.onrender.com

## What's included

**Core requirements**
- **Available time slots** — browse mentors, see their open slots grouped by day
- **Pick and confirm** — choose a session length, pick a slot, enter name + email, confirm
  the booking
- **Stored in a database, no double-booking** — bookings persist in PostgreSQL; no two
  bookings for the same mentor can ever overlap in time, even across different session
  lengths or under concurrent requests (see [Preventing double-booking](#preventing-double-booking))

**Beyond the brief**
- **Variable session lengths** — 30, 45, or 60 minutes, with 30 as the default. Each mentor
  only offers the lengths they've chosen to (see [Session lengths](#session-lengths)) — not
  every mentor does every length, and the UI reflects that.
- **Browse by field** — 10 career fields (Tech & IT, Healthcare & Medicine, Law & Legal,
  Engineering & Construction, and more), 32 mentors total, so the app reads like a real
  multi-industry mentorship platform instead of one flat list. All mentor profiles are
  fictional demo data, not real people.
- **No account needed** — booking only asks for a name and email; "my bookings" are looked
  up by email, no login/password anywhere
- **Cancel + rebook** — cancelling a booking frees the time so someone else (or the same
  person) can take it
- **Real concurrency test, not a mocked one** — a Jest suite fires 5 simultaneous booking
  requests at the same time against a real local Postgres instance and asserts exactly one
  wins, plus a dedicated test proving a 30-minute booking can't be squeezed into the middle
  of someone else's 60-minute session (see [Testing](#testing))
- **Rate limiting + security headers** — Helmet, and a dedicated rate limit on the booking
  endpoint to blunt scripted slot-grabbing
- **Self-seeding demo data** — every boot re-runs an idempotent seed script, so the live
  demo always has fresh future slots across the next two weeks without manual upkeep
- **Full calendar days of lead time, not a sliding window** — available slots are computed
  against the end of day N, not `now() + N*24h`, so a request made late in the day can't
  silently clip the last visible day's morning slots (an easy mistake with the obvious
  implementation, and one this app had briefly)
- **Distinct visual identity** — an "appointment ledger" design (ledger rows, day tabs, a
  wax-stamp confirmation) rather than a generic form-and-card template
- **Mobile-tested** — checked for horizontal overflow at 320/360/375/390px before shipping

```
mentorslot/
  backend/     Express API + PostgreSQL (Node)
  frontend/    React app (Vite)
```

## Session lengths

Sessions can be **30, 45, or 60 minutes**, with 30 as the default. Which lengths a given
mentor offers is configurable per mentor (`mentors.allowed_durations`, a Postgres array) —
the seed data deliberately varies it instead of giving everyone the full menu, e.g. one
mentor only takes 30-minute sessions, another offers 30 or 45, another the full 30/45/60,
and another skips 45 and offers only 30 or 60. The booking UI shows a duration picker on
each mentor's page, greys out lengths that mentor doesn't offer, and the server independently
re-validates the chosen duration against that mentor's `allowed_durations` before ever
touching the bookings table — a disabled button in the UI is a convenience, not the only
guard.

## Preventing double-booking

Variable session lengths mean two bookings can collide without being for the *identical*
time — a 60-minute booking at 9:00 and a 30-minute booking at 9:15 overlap just as surely as
two bookings for the exact same slot would. A fixed-slot `UNIQUE` constraint can't express
that, so the guarantee lives in a single Postgres **`EXCLUDE` constraint** instead:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (mentor_id WITH =, tstzrange(start_time, end_time) WITH &&);
```

This tells Postgres: for a given `mentor_id`, no two rows may have overlapping
`[start_time, end_time)` ranges — enforced atomically on every `INSERT`, the same way a
`UNIQUE` constraint is, with no manual transaction or row-locking needed in the API code. A
plain `INSERT INTO bookings (...)` either succeeds or raises error code `23P01`
(`exclusion_violation`), which the API catches and turns into a `409`.

Available slots are also computed *live* on each request (business-hours grid minus that
mentor's existing bookings for the requested duration) rather than read off a pre-generated
table, since a fixed-granularity slot table can't cleanly represent 30/45/60-minute
availability at once — see `backend/lib/schedule.js` and `backend/routes/mentors.js`. The
grid itself is spaced by the requested duration plus a 15-minute buffer (not a flat
half-hour grid independent of duration), so a 45-minute candidate at 9:00-9:45 is followed
by one at 10:00-10:45, not an overlapping 9:30-10:15 — every mentor gets a breather between
sessions, and the list never shows two candidates that couldn't both be booked anyway. That
read path is a convenience for not offering slots that would obviously conflict; the actual
guarantee against bad data ever landing in the table is the `EXCLUDE` constraint above.

This is proven, not just asserted: `tests/concurrency.test.js` opens a real Postgres
connection and (1) fires 5 simultaneous booking requests at the identical time and asserts
exactly 1 succeeds and 4 get `409`, (2) books a 60-minute session and then attempts a
30-minute booking starting 15 minutes into it, asserting that also gets `409`, and (3) books
a 30-minute session starting exactly when a prior 60-minute session ends and asserts that
succeeds (adjacent, non-overlapping bookings are fine) — see [Testing](#testing).

## 1. Set up the database

Create a Postgres database (locally, or a free instance on Render/Supabase/Railway/Neon),
then apply the schema:

```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL
npm install
npm run migrate   # creates fields, mentors, bookings tables + the overlap-prevention constraint (safe to re-run; idempotent)
npm run seed      # upserts the 10 fields and 32 mentors (availability is computed live, not pre-seeded)
```

## 2. Run the backend

```bash
cd backend
npm run dev        # http://localhost:4001
```

## 3. Run the frontend

```bash
cd frontend
cp .env.example .env   # VITE_API_URL, defaults to http://localhost:4001/api
npm install
npm run dev         # http://localhost:5173
```

Vite's dev server proxies `/api` to `http://localhost:4001` automatically, so the two
`.env` files only really matter once you deploy.

## Testing

```bash
cd backend
npm test
```

Runs the offline suite (mocked database, no live Postgres or network needed): input
validation (including the three allowed session lengths), the mentors/slots routes (including
duration filtering and a mentor-doesn't-offer-this-length rejection), and the bookings routes
(successful booking, the exclusion-constraint double-booking path, lookup by email, and
cancel with ownership-by-email checks).

The concurrency proof needs a real database and is skipped by default:

```bash
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/mentorslot_test" npm run test:concurrency
```

This spins up one mentor and proves the `EXCLUDE` constraint three ways — 5 simultaneous
identical-time bookings (exactly 1 wins), a 30-minute booking that starts partway through an
existing 60-minute booking (rejected), and a 30-minute booking that starts exactly when a
prior 60-minute booking ends (allowed) — a real proof of the guard in
[Preventing double-booking](#preventing-double-booking), not a mocked stand-in for one.

## API overview

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/api/fields` | List fields with a mentor count for each |
| GET    | `/api/fields/:id/mentors` | A field + its mentors |
| GET    | `/api/mentors` | List all mentors (flat, across every field), each with its `allowed_durations` |
| GET    | `/api/mentors/:id/slots?duration=&days=` | A mentor + their available future slots for a given session length (`duration` defaults to 30; must be one the mentor offers) |
| POST   | `/api/bookings` | Book a session `{ mentor_id, start_time, duration, name, email }` — `400` if the mentor doesn't offer that duration, `409` if the time overlaps an existing booking |
| GET    | `/api/bookings?email=` | List bookings for an email address |
| DELETE | `/api/bookings/:id` | Cancel a booking `{ email }` in the body must match the booking's owner |

`POST /api/bookings` is rate-limited (30 requests / 15 min / IP).

## Deployment

The app is split across three managed services, same shape as a typical MERN-style deploy:

**Database:** [Supabase](https://supabase.com) (managed PostgreSQL).

**Backend — Render Web Service:**
1. New → Web Service → point at the repo, build/start commands `cd backend && npm install` / `cd backend && npm start`
2. Environment variables: `DATABASE_URL` (Supabase's **connection pooler** string — `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres` — not the direct `db.<project-ref>.supabase.co` host; Render's network can't reach that host's IPv6-only address, which surfaces as `ENETUNREACH` at boot), `CORS_ORIGIN` (the deployed frontend's origin), `PGSSL=true`
3. `npm start` runs `node migrate.js && node seed.js && node server.js`, so the schema (including the overlap-prevention constraint) is applied and the fields/mentors are upserted on every boot (idempotent — safe to leave permanently; availability itself is computed live, not seeded, so it's always current)

**Frontend — Vercel:**
1. Import the repo → set the project's **Root Directory** to `frontend` (Vercel auto-detects Vite)
2. Environment variable: `VITE_API_URL` = `https://<your-backend>.onrender.com/api`
3. `frontend/vercel.json` adds the standard SPA rewrite (`/(.*) → /index.html`) so client-side
   routes like `/my-bookings` work on a direct visit or page refresh, not just when reached by
   clicking through the app — without it, Vercel's static file server 404s on any path it
   doesn't have a literal file for.

## Notes for extending it

- There's no notion of mentor-side auth or availability management yet — mentors and their
  working hours are seeded, not editable through the UI. A natural next step is a mentor
  login that lets them set their own weekly availability instead of the fixed 9–5 seed.
- Email confirmations are not sent (the booking confirmation screen says so plainly) — adding
  a transactional email provider on successful booking/cancellation would be the next piece
  of real-world polish.
- Repo is two independent npm projects (no shared root `package.json`) so each half can be
  deployed and scaled separately.
