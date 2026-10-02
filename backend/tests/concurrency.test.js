// Real-database proof that overlapping, too-close and concurrent booking
// attempts for the same mentor cannot both succeed — including across
// *different* session durations. This talks to an actual Postgres instance
// (not mocked), because the guarantee we're proving lives in Postgres's
// EXCLUDE constraint (migrations/002_buffer_constraint.sql), not in JS — a
// mocked test can't demonstrate that. It also checks the migrations
// themselves (idempotent, CHECK constraints) and cancel against real rows.
//
// Skipped automatically unless TEST_DATABASE_URL is set, so the default
// `npm test` run stays fully offline. Run explicitly with:
//   TEST_DATABASE_URL=postgres://... npm run test:concurrency

const hasDb = !!process.env.TEST_DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("booking rules against real Postgres", () => {
  let pool;
  let app;
  let request;
  let mentorId;
  let businessDays;
  let createManageToken;

  // HH:MM UTC on the Nth upcoming bookable weekday — always a real grid day
  // inside the horizon, whatever today's date is.
  const at = (dayIndex, hour, minute = 0) => {
    const d = new Date(businessDays[dayIndex]);
    d.setUTCHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const book = (start_time, duration, who = "booker") =>
    request(app)
      .post("/api/bookings")
      .send({ mentor_id: mentorId, start_time, duration, name: `Test ${who}`, email: `${who}@example.com` });
  const count = async () => (await pool.query("SELECT count(*)::int AS n FROM bookings WHERE mentor_id = $1", [mentorId])).rows[0].n;
  const insertRaw = (start, end, minutes) =>
    pool.query(
      `INSERT INTO bookings (mentor_id, mentee_name, mentee_email, start_time, end_time, duration_minutes)
       VALUES ($1, 'Raw', 'raw@example.com', $2, $3, $4)`,
      [mentorId, start, end, minutes]
    );

  beforeAll(async () => {
    // No mail provider here: keep the dev "would have sent" console output out of the test log.
    jest.spyOn(console, "log").mockImplementation(() => {});
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.PGSSL = process.env.TEST_PGSSL || "false";
    process.env.NODE_ENV = "test";

    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
    });

    await require("../migrate").migrate(pool);

    const mentor = await pool.query(
      `INSERT INTO mentors (name, title, bio, color, allowed_durations)
       VALUES ($1, 'Test', 'Test bio', '#000000', '{30,45,60}')
       RETURNING id`,
      [`Test Mentor ${Date.now()}`]
    );
    mentorId = mentor.rows[0].id;

    request = require("supertest");
    // Fresh require so the app picks up the env vars set above.
    jest.resetModules();
    app = require("../server");
    createManageToken = require("../lib/manageToken").createManageToken;
    businessDays = require("../lib/schedule").businessDays(new Date(), 30);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM mentors WHERE id = $1", [mentorId]);
    await pool.end();
  });

  afterEach(async () => {
    await pool.query("DELETE FROM bookings WHERE mentor_id = $1", [mentorId]);
  });

  describe("overlap", () => {
    it("lets exactly one of five simultaneous requests for the identical time win", async () => {
      const start = at(0, 9);
      const names = ["RequesterA", "RequesterB", "RequesterC", "RequesterD", "RequesterE"];
      const results = await Promise.all(names.map((n) => book(start, 30, n.toLowerCase())));

      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
      expect(await count()).toBe(1);
    });

    it("blocks a 30-minute booking that starts partway through an existing 60-minute booking", async () => {
      expect((await book(at(1, 9), 60, "long")).status).toBe(201);
      // 09:45 is on the 30-minute grid but sits inside 09:00-10:00.
      expect((await book(at(1, 9, 45), 30, "short")).status).toBe(409);
      expect(await count()).toBe(1);
    });
  });

  describe("15-minute buffer", () => {
    it("rejects a 60-minute session that starts the moment a 30-minute one ends (09:45-10:15 then 10:15-11:15)", async () => {
      expect((await book(at(2, 9, 45), 30, "first")).status).toBe(201);
      const second = await book(at(2, 10, 15), 60, "second");
      expect(second.status).toBe(409);
      expect(await count()).toBe(1);
    });

    it("applies the buffer in the other order too (later session booked first)", async () => {
      expect((await book(at(2, 10, 15), 60, "later")).status).toBe(201);
      expect((await book(at(2, 9, 45), 30, "earlier")).status).toBe(409);
      expect(await count()).toBe(1);
    });

    it("allows sessions with exactly a 15-minute gap, and more", async () => {
      expect((await book(at(3, 9), 30, "one")).status).toBe(201); // 09:00-09:30
      expect((await book(at(3, 9, 45), 30, "two")).status).toBe(201); // 15 min later
      expect((await book(at(3, 13), 60, "three")).status).toBe(201);
      expect((await book(at(3, 14, 30), 30, "four")).status).toBe(201); // 30 min gap
      expect(await count()).toBe(4);
    });

    it("is enforced by the database itself, not just the API", async () => {
      const day = new Date(businessDays[4]);
      const t = (h, m) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m)).toISOString();
      await insertRaw(t(9, 45), t(10, 15), 30);
      await expect(insertRaw(t(10, 15), t(11, 15), 60)).rejects.toMatchObject({ code: "23P01" });
      await expect(insertRaw(t(10, 29), t(10, 59), 30)).rejects.toMatchObject({ code: "23P01" });
      await insertRaw(t(10, 30), t(11, 0), 30); // exactly 15 minutes after the 10:15 end
      await insertRaw(t(9, 0), t(9, 30), 30); // exactly 15 minutes before the 09:45 start
      expect(await count()).toBe(3);
    });

    it("the slots endpoint stops offering what the database would refuse", async () => {
      expect((await book(at(5, 9, 45), 30, "slotcheck")).status).toBe(201);
      const wanted = new Date(businessDays[5]).toISOString().slice(0, 10);
      const sixty = await request(app).get(`/api/mentors/${mentorId}/slots?duration=60&days=30`);
      const onDay = sixty.body.slots.filter((s) => s.start_time.startsWith(wanted)).map((s) => s.start_time.slice(11, 16));
      expect(onDay).not.toContain("09:00"); // would end 10:00, inside the buffer of 09:45
      expect(onDay).not.toContain("10:15"); // starts exactly when the booking ends
      expect(onDay).toContain("13:00");
    });
  });

  describe("cancelling with a private manage link", () => {
    const manage = (action, token) => request(app).post(`/api/manage/${action}`).send({ token });

    it("books, views and cancels with the token returned at booking time, atomically", async () => {
      const created = await book(at(6, 9), 30, "owner");
      expect(created.status).toBe(201);
      const { manage_token: token, booking } = created.body;
      expect(token).toMatch(new RegExp(`^${booking.id}\\.[A-Za-z0-9_-]{43}$`));

      const view = await manage("view", token);
      expect(view.status).toBe(200);
      expect(view.body.booking).toMatchObject({
        status: "upcoming",
        duration_minutes: 30,
        mentee_first_name: "Test",
        mentee_email_masked: "o***@example.com",
      });

      // A forged token (right id, wrong mac) and another booking's token do nothing.
      const mac = token.split(".")[1];
      const forged = `${booking.id}.${(mac[0] === "A" ? "B" : "A") + mac.slice(1)}`;
      expect((await manage("cancel", forged)).status).toBe(404);
      expect(await count()).toBe(1);

      expect((await manage("cancel", token)).status).toBe(200);
      expect(await count()).toBe(0);

      // Idempotent-safe: the second cancel (and a view) are the same generic 404.
      const again = await manage("cancel", token);
      expect(again.status).toBe(404);
      expect(again.body).toEqual({ error: "Booking not found." });
      expect((await manage("view", token)).status).toBe(404);
    });

    it("frees the time for someone else once cancelled", async () => {
      const first = await book(at(6, 13), 30, "first");
      expect((await book(at(6, 13), 30, "second")).status).toBe(409);
      expect((await manage("cancel", first.body.manage_token)).status).toBe(200);
      expect((await book(at(6, 13), 30, "second")).status).toBe(201);
    });

    it("two simultaneous cancels: exactly one succeeds, the other is a 404", async () => {
      const created = await book(at(6, 14, 30), 30, "racer");
      const results = await Promise.all([1, 2, 3, 4].map(() => manage("cancel", created.body.manage_token)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 404)).toHaveLength(3);
    });

    it("refuses to cancel a session that has already started (409) and shows it as started", async () => {
      const started = await pool.query(
        `INSERT INTO bookings (mentor_id, mentee_name, mentee_email, start_time, end_time, duration_minutes)
         VALUES ($1, 'Past', 'past@example.com', now() - interval '10 minutes', now() + interval '20 minutes', 30)
         RETURNING id`,
        [mentorId]
      );
      const token = createManageToken(started.rows[0].id);
      expect((await manage("view", token)).body.booking.status).toBe("started");
      const res = await manage("cancel", token);
      expect(res.status).toBe(409);
      expect(await count()).toBe(1);

      await pool.query("UPDATE bookings SET end_time = now() - interval '1 minute', start_time = now() - interval '31 minutes' WHERE id = $1", [started.rows[0].id]);
      expect((await manage("view", token)).body.booking.status).toBe("past");
    });

    it("the old email-based routes are gone", async () => {
      const created = await book(at(6, 9), 30, "legacy");
      expect((await request(app).get("/api/bookings?email=legacy@example.com")).status).toBe(404);
      expect((await request(app).delete(`/api/bookings/${created.body.booking.id}`).send({ email: "legacy@example.com" })).status).toBe(404);
      expect(await count()).toBe(1);
    });
  });

  describe("migrations", () => {
    it("are recorded once each and re-running changes nothing", async () => {
      const { migrate, listMigrations } = require("../migrate");
      const before = await pool.query("SELECT name FROM schema_migrations ORDER BY name");
      expect(before.rows.map((r) => r.name)).toEqual(listMigrations());
      expect(await migrate(pool)).toEqual([]);
      const after = await pool.query("SELECT name FROM schema_migrations ORDER BY name");
      expect(after.rows).toEqual(before.rows);
    });

    it("add CHECK constraints that reject inconsistent rows", async () => {
      const day = new Date(businessDays[7]);
      const t = (h, m) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m)).toISOString();
      await expect(insertRaw(t(9, 30), t(9, 0), 30)).rejects.toMatchObject({ code: "23514" }); // ends before it starts
      await expect(insertRaw(t(9, 0), t(9, 50), 50)).rejects.toMatchObject({ code: "23514" }); // unsupported length
      await expect(insertRaw(t(9, 0), t(9, 45), 30)).rejects.toMatchObject({ code: "23514" }); // length doesn't match range
      await expect(
        pool.query("UPDATE mentors SET allowed_durations = '{30,90}' WHERE id = $1", [mentorId])
      ).rejects.toMatchObject({ code: "23514" });
      expect(await count()).toBe(0);
    });
  });
});
