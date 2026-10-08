# MentorSlot — book time with a mentor.
**Built by Christian Tetteh a full stack developer intern at Career Ghana**

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
- **No account needed, private links instead** — booking only asks for a name and email.
  Each booking gets an unguessable private link to view and cancel it (shown once on the
  confirmation ticket and emailed); see [Security model](#security-model-private-manage-links)
- **Cancel + rebook** — cancelling a booking frees the time so someone else (or the same
  person) can take it; a session that has already started can't be cancelled
- **Real concurrency test, not a mocked one** — a Jest suite fires 5 simultaneous booking
  requests at the same time against a real local Postgres instance and asserts exactly one
  wins, plus a dedicated test proving a 30-minute booking can't be squeezed into the middle
  of someone else's 60-minute session (see [Testing](#testing))
- **Rate limiting + security headers** — Helmet, a dedicated rate limit on the booking
  endpoint to blunt scripted slot-grabbing, tighter limits on "email me my links", and one on
  the manage endpoints
- **Self-seeding demo data** — every boot applies any pending migrations and re-runs an
  idempotent (upsert-only) seed script, so the live demo always has its fields and mentors,
  and fresh future slots across the next two weeks, without manual upkeep or data loss
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
that, so the guarantee lives in a single Postgres **`EXCLUDE` constraint** instead (see
`backend/migrations/002_buffer_constraint.sql`):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- start .. end + 15 minutes (an IMMUTABLE wrapper so it can be indexed)
ALTER TABLE bookings
  ADD CONSTRAINT no_overlapping_bookings_buffered
  EXCLUDE USING gist (mentor_id WITH =, booking_blocked_range(start_time, end_time) WITH &&);
```

This tells Postgres: for a given `mentor_id`, no two rows may have overlapping
`[start_time, end_time + 15 minutes)` ranges. That is both the no-overlap rule and a
**15-minute minimum gap between a mentor's sessions, whatever the mix of lengths** (a
09:45–10:15 session followed by 10:15–11:15 is refused; 09:45–10:15 followed by 10:30 is
fine). It is enforced atomically on every `INSERT`, the same way a `UNIQUE` constraint is,
with no manual transaction or row-locking needed in the API code. A violation raises error
code `23P01` (`exclusion_violation`), which the API turns into a `409`.

The server also enforces its own scheduling rules rather than trusting the UI:
`POST /api/bookings` only accepts a start time the slots endpoint would actually list for
that duration — a weekday, inside business hours (09:00–12:00 and 13:00–17:00 UTC), on the
duration-specific grid, from tomorrow through 30 days ahead. Anything else is a `400`. Both
the slots endpoint and booking validation use the same `candidateSlots()` in
`backend/lib/schedule.js`.

Available slots are computed *live* on each request (the business-hours grid minus that
mentor's existing bookings, each padded by the buffer) rather than read off a pre-generated
table, since a fixed-granularity slot table can't cleanly represent 30/45/60-minute
availability at once. The grid is spaced by the requested duration plus the 15-minute buffer,
so a 45-minute candidate at 9:00–9:45 is followed by one at 10:00–10:45, not an overlapping
9:30–10:15. That read path is a convenience for not offering slots that would obviously
conflict; the actual guarantee against bad data landing in the table is the database
constraint above.

This is proven, not just asserted: `tests/concurrency.test.js` uses a real Postgres
connection and (1) fires 5 simultaneous booking requests at the identical time and asserts
exactly 1 succeeds and 4 get `409`, (2) books a 60-minute session and attempts a 30-minute
booking inside it (`409`), (3) checks the buffer in both orders (30-minute 09:45–10:15 then a
60-minute 10:15 start is `409`; exactly 15 minutes apart is fine), directly against the
database as well as through the API, and (4) checks cancel and the migrations — see
[Testing](#testing).

## 1. Set up the database

Create a Postgres database (locally, or a free instance on Render/Supabase/Railway/Neon),
then apply the schema:

```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL
npm install
npm run migrate   # applies any pending migrations/NNN_*.sql, each once, in a transaction (safe to re-run; never drops data)
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
npm install
npm run dev         # http://localhost:5173
```

Locally you don't need a frontend `.env`: with `VITE_API_URL` unset the app calls `/api`, and
Vite's dev server proxies that to `http://localhost:4001`. `frontend/.env.example` shows the
variable you set when deploying (`VITE_API_URL`). If you copy it to `frontend/.env` locally,
the browser calls that URL directly instead of using the proxy, so the backend's
`CORS_ORIGIN` must match the frontend's origin (`http://localhost:5173`).

## Testing

```bash
cd backend
npm test
```

Runs every suite that doesn't need a database (the database module is mocked, a fixed fake
clock replaces the real date, and no network is used): `validation.test.js` (input rules,
including the server-side grid/horizon checks), `schedule.test.js` (grid math), `fields.test.js`
(the fields routes), `mentors.test.js` (the slots route, duration filtering, buffer padding),
`bookings.test.js` (create, manage token and confirmation email, old routes gone),
`manageToken.test.js` (token forgery cases, MANAGE_SECRET rules), `manage.test.js` (view/cancel,
409 after start, double cancel), `lookup.test.js` ("email me my links": generic reply, email
contents, forged Host headers, 503), `mailer.test.js` (Brevo request, timeouts, no key in logs),
`leaks.test.js` (token never in logs or URLs), `config.test.js` (refuse-to-boot rules),
`windowLimiter.test.js`, `robustness.test.js` (malformed input incl. non-string tokens/emails, bad
ids/params, error handling), `ratelimit.test.js` (all limits, path-variant bypass, CORS origin
handling) and `migrations.test.js` (migration file hygiene).

**Only `tests/concurrency.test.js` needs Postgres** (it is skipped by `npm test`). Point it at
a scratch database; it applies the migrations itself:

```bash
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/mentorslot_test" npm run test:concurrency
```

It proves the `EXCLUDE` constraint against a real database — 5 simultaneous identical-time
bookings (exactly 1 wins), overlap across different durations, the 15-minute buffer in both
orders (through the API and with raw SQL), real cancel-by-private-link behaviour (including
simultaneous cancels), idempotent migrations and the
`CHECK` constraints — a real proof of the guard in
[Preventing double-booking](#preventing-double-booking), not a mocked stand-in for one.

## API overview

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/api/fields` | List fields with a mentor count for each |
| GET    | `/api/fields/:id/mentors` | A field + its mentors |
| GET    | `/api/mentors` | List all mentors (flat, across every field), each with its `allowed_durations` (not used by this frontend; kept as part of the public API) |
| GET    | `/api/mentors/:id/slots?duration=&days=` | A mentor + their available future slots for a given session length (`duration` defaults to 30 and must be one the mentor offers; `days` is a whole number 1–30, default 14) |
| POST   | `/api/bookings` | Book a session `{ mentor_id, start_time, duration, name, email }`. `start_time` is ISO 8601 **with** a timezone offset and must be a slot the slots endpoint offers (`400` otherwise, or if the mentor doesn't offer that duration); `409` if it overlaps, or is within 15 minutes of, an existing booking |
| POST   | `/api/bookings/lookup` | `{ email }` — emails that address one message with a private link per upcoming booking. Always the same `200` message whether or not bookings exist; `503` if the server has no email provider; limited to 10/hour/IP and 5/hour/address (the latter silent) |
| POST   | `/api/manage/view` | `{ token }` — the booking behind a private link (mentor, time, status `upcoming`/`started`/`past`, first name, masked email) |
| POST   | `/api/manage/cancel` | `{ token }` — cancel with one atomic `DELETE ... RETURNING`; `409` once the session has started; `404` if unknown or already cancelled |

`POST /api/bookings` also returns `manage_token` (once) and `emailed` (`true` only if a mail
provider is configured). Listing or cancelling by email address no longer exists
(`GET /api/bookings?email=` and `DELETE /api/bookings/:id` are `404`). Tokens only ever travel in
POST bodies, never URLs.

Errors are always JSON `{ "error": "..." }`. `POST /api/bookings` is rate-limited (30 requests /
15 min / IP), `/api/bookings/lookup` to 10 / hour / IP, `/api/manage/*` to 60 / 15 min / IP (`429`). The API trusts one proxy hop (`trust proxy = 1`, as on Render) to identify the client IP.

## Deployment

The app is split across three managed services, same shape as a typical MERN-style deploy:

**Database:** [Supabase](https://supabase.com) (managed PostgreSQL).

**Backend — Render Web Service:**
1. New → Web Service → point at the repo. Build command: `cd backend && npm install`. Start
   command: `cd backend && npm start`
2. Environment variables: `DATABASE_URL` (Supabase's **connection pooler** string — `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres` — not the direct `db.<project-ref>.supabase.co` host; Render's network can't reach that host's IPv6-only address, which surfaces as `ENETUNREACH` at boot), `CORS_ORIGIN` (the deployed frontend's origin, e.g. `https://mentorslot.vercel.app`; a trailing slash is stripped, and the server logs a warning in production if it's unset), `PGSSL=true`, plus the private-link settings below:

   | Variable | Required | Purpose |
   |---|---|---|
   | `MANAGE_SECRET` | **yes in production** (boot is refused without it) | Random secret, 32+ characters (`openssl rand -base64 48`). HMAC key for manage links. Changing it invalidates every existing link |
   | `FRONTEND_ORIGIN` | recommended | Origin used in emailed links, e.g. `https://mentorslot.vercel.app`. Falls back to the first value of `CORS_ORIGIN`. Never read from request headers |
   | `BREVO_API_KEY` | for email | Brevo API key. Without it no mail is sent (`emailed:false`, "Email me my links" answers `503`) |
   | `MAIL_FROM` | for email | Sender address, verified in Brevo |
   | `MAIL_FROM_NAME` | no | Sender name (default `MentorSlot`) |
3. `npm start` runs `node migrate.js && node seed.js && node server.js`. This is non-destructive:
   `migrate.js` applies each pending file in `backend/migrations/` once (tracked in the
   `schema_migrations` table, each in its own transaction) and never drops anything, and
   `seed.js` only upserts fields and mentors, so it's safe to leave as the permanent start
   command (availability itself is computed live, not seeded). Earlier versions ran a
   `schema.sql` containing `DROP TABLE` on every boot; that file is gone.

*Upgrading the already-deployed database:* keep the same start command. The first boot of this
version records `001_initial.sql` (a no-op against the existing tables), then applies `002`
(replaces the overlap constraint with the 15-minute-buffer one) and `003` (CHECK constraints, added
`NOT VALID` first and validated only if existing rows pass). `002` aborts the deploy with a clear
message, changing nothing, if two existing bookings for the same mentor are less than 15 minutes
apart; cancel or move one of each pair and redeploy. Because the failed migration rolls back, the
previous deploy keeps serving.

**Frontend — Vercel:**
1. Import the repo → set the project's **Root Directory** to `frontend` (Vercel auto-detects Vite)
2. Environment variable: `VITE_API_URL` = `https://<your-backend>.onrender.com/api`
3. `frontend/vercel.json` adds the standard SPA rewrite (`/(.*) → /index.html`) so client-side
   routes like `/manage` and `/my-bookings` work on a direct visit or page refresh, not just when reached by
   clicking through the app — without it, Vercel's static file server 404s on any path it
   doesn't have a literal file for.

## Notes for extending it

- There's no notion of mentor-side auth or availability management yet — mentors and their
  working hours are seeded, not editable through the UI. A natural next step is a mentor
  login that lets them set their own weekly availability instead of the fixed 9–5 seed.
- Confirmation emails go out through Brevo (see the env table above); cancellation emails, reminders
  and rescheduling are the natural next pieces.
- Repo is two independent npm projects (no shared root `package.json`) so each half can be
  deployed and scaled separately.

## Security model (private manage links)

There are no accounts, so access to a booking is a **private link** instead of an email address.
Knowing someone's email no longer lets you list or cancel their bookings.

- **Token** = `<bookingId>.<mac>`, `mac = base64url(HMAC-SHA256(MANAGE_SECRET, "manage:" + bookingId))`.
  256 bits, unguessable, nothing stored in the database (it is recomputed on demand), so a leaked
  database alone cannot cancel anything. Verified with `crypto.timingSafeEqual`; malformed tokens are
  rejected before any database query; forged, unknown and already-cancelled links all give the same
  `404 {"error":"Booking not found."}`.
- **Link** = `FRONTEND_ORIGIN/manage#<token>`. The token is in the URL *fragment*, which browsers never
  send to servers, so it stays out of access logs and `Referer` headers; the page reads it, then removes
  it from the address bar. API calls carry it in a POST body only. The link origin comes from
  configuration, never from the `Host` / `X-Forwarded-Host` headers, so the links in emails can't be
  poisoned.
- **Who gets it:** the booker sees it once on the confirmation ticket (copy button) and by email.
  "Find my bookings" emails the links for an address's upcoming bookings; its reply is identical whether
  or not the address has bookings and is sent before any lookup, so it can't be used to discover who
  has booked. Per-address (5/hour, silent) and per-IP (10/hour) limits stop it being used to flood an inbox.
- **Production safety:** the server refuses to boot without a `MANAGE_SECRET` of 32+ characters (a
  mis-cased `NODE_ENV` or Render's `RENDER` marker also count as production; the public dev fallback
  secret is never used there).
- **Bearer links:** anyone who has a link can cancel that booking (the emails and confirmation say so).
  There is no way to revoke a single link short of cancelling the booking; rotating `MANAGE_SECRET`
  revokes all of them.
- Mail failures never fail a booking; sends happen after the response.

## Known limits

- **Private links are bearer credentials** (see above): anyone holding one can view and cancel that
  booking; there is no per-link revocation and no login. Confirmation emails go to whatever address the
  booker typed (capped at 5/hour per address), so a stranger can cause a few emails to reach an address,
  though they only contain a link to the booking that sender made. Rate limits are in memory and per
  process (fine for one Render instance).
- Mentor hours are a fixed 09:00–17:00 UTC weekday grid, not per-mentor or per-timezone.
- Idle-connection drops are logged and recovered, but there is no request-level retry on a
  database outage.
