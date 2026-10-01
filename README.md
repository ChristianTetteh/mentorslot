# MentorSlot — book time with a mentor.

A full-stack booking/scheduling app built for the "Simple Booking/Scheduling App" intern
task: **React + Node/Express + PostgreSQL**, deployed, tested, and built with a genuine
(not cosmetic) double-booking guard.

**Live demo:** https://mentorslot.vercel.app
**API:** https://mentorslot-backend.onrender.com

## What's included

**Core requirements**
- **Available time slots** — browse mentors, see their open slots grouped by day
- **Pick and confirm** — select a slot, enter name + email, confirm the booking
- **Stored in a database, no double-booking** — bookings persist in PostgreSQL; a slot can
  never be booked twice, even under concurrent requests (see [Preventing double-booking](#preventing-double-booking))

**Beyond the brief**
- **Browse by field** — 10 career fields (Tech & IT, Healthcare & Medicine, Law & Legal,
  Engineering & Construction, and more), 32 mentors total, so the app reads like a real
  multi-industry mentorship platform instead of one flat list. All mentor profiles are
  fictional demo data, not real people.
- **No account needed** — booking only asks for a name and email; "my bookings" are looked
  up by email, no login/password anywhere
- **Cancel + rebook** — cancelling a booking frees the slot so someone else (or the same
  person) can take it
- **Real concurrency test, not a mocked one** — a Jest suite fires 5 simultaneous booking
  requests at the same slot against a real local Postgres instance and asserts exactly one
  wins (see [Testing](#testing))
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

## Preventing double-booking

Two layers, so a bug in one doesn't let a double-booking slip through:

1. **Atomic conditional update.** Booking a slot runs inside a transaction:
   ```sql
   UPDATE slots
   SET status = 'booked'
   WHERE id = $1 AND status = 'available' AND start_time > now()
   RETURNING mentor_id, start_time, end_time
   ```
   Postgres row-locks the targeted slot for the duration of the transaction. If two requests
   race for the same slot, the second one blocks until the first commits, then its `UPDATE`
   matches zero rows (the status is no longer `'available'`) and the API returns `409`
   without ever inserting a booking.
2. **`UNIQUE` constraint on `bookings.slot_id`** — defense in depth. Even if the application
   logic above were ever bypassed, the database itself refuses a second booking row for the
   same slot (Postgres error `23505`), which the API also catches and turns into a `409`.

This is proven, not just asserted: `tests/concurrency.test.js` opens a real Postgres
connection, fires 5 simultaneous booking requests at one slot, and asserts exactly 1
succeeds and 4 get `409` — see [Testing](#testing).

## 1. Set up the database

Create a Postgres database (locally, or a free instance on Render/Supabase/Railway/Neon),
then apply the schema:

```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL
npm install
npm run migrate   # creates mentors, slots, bookings tables (safe to re-run; idempotent)
npm run seed      # generates the next 7 weekdays of slots for each mentor
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
validation, the mentors/slots routes, and the bookings routes (successful booking, the
0-rows-affected double-booking path, the unique-violation fallback, lookup by email, and
cancel with ownership-by-email checks).

The concurrency proof needs a real database and is skipped by default:

```bash
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/mentorslot_test" npm run test:concurrency
```

This spins up one mentor and one open slot, fires 5 simultaneous `POST /api/bookings`
requests at it, and asserts exactly 1 returns `201` and 4 return `409` — a real proof of the
guard in [Preventing double-booking](#preventing-double-booking), not a mocked stand-in for one.

## API overview

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/api/fields` | List fields with a mentor count for each |
| GET    | `/api/fields/:id/mentors` | A field + its mentors |
| GET    | `/api/mentors` | List all mentors (flat, across every field) |
| GET    | `/api/mentors/:id/slots?days=` | A mentor + their available future slots |
| POST   | `/api/bookings` | Book a slot `{ slot_id, name, email }` — `409` if already taken |
| GET    | `/api/bookings?email=` | List bookings for an email address |
| DELETE | `/api/bookings/:id` | Cancel a booking `{ email }` in the body must match the booking's owner; frees the slot |

`POST /api/bookings` is rate-limited (30 requests / 15 min / IP).

## Deployment

The app is split across three managed services, same shape as a typical MERN-style deploy:

**Database:** [Supabase](https://supabase.com) (managed PostgreSQL).

**Backend — Render Web Service:**
1. New → Web Service → point at the repo, build/start commands `cd backend && npm install` / `cd backend && npm start`
2. Environment variables: `DATABASE_URL` (Supabase's **connection pooler** string — `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres` — not the direct `db.<project-ref>.supabase.co` host; Render's network can't reach that host's IPv6-only address, which surfaces as `ENETUNREACH` at boot), `CORS_ORIGIN` (the deployed frontend's origin), `PGSSL=true`
3. `npm start` runs `node migrate.js && node seed.js && node server.js`, so the schema is applied and fresh slots are seeded on every boot (idempotent — safe to leave permanently, keeps the live demo bookable as time passes)

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
