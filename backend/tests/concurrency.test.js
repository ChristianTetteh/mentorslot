// Real-database proof that overlapping booking attempts for the same mentor
// cannot both succeed — including across *different* session durations. This
// talks to an actual Postgres instance (not mocked), because the guarantee
// we're proving lives in Postgres's EXCLUDE constraint (migrations/), not in
// JS — a mocked test can't demonstrate that.
//
// Skipped automatically unless TEST_DATABASE_URL is set, so the default
// `npm test` run stays fully offline. Run explicitly with:
//   TEST_DATABASE_URL=postgres://... npm run test:concurrency

const hasDb = !!process.env.TEST_DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("concurrent / overlapping booking attempts (real Postgres)", () => {
  let pool;
  let app;
  let request;
  let mentorId;

  beforeAll(async () => {
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
       VALUES ('Test Mentor', 'Test', 'Test bio', '#000000', '{30,45,60}')
       RETURNING id`
    );
    mentorId = mentor.rows[0].id;

    request = require("supertest");
    // Fresh require so the app picks up the env vars set above.
    jest.resetModules();
    app = require("../server");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM mentors WHERE id = $1", [mentorId]);
    await pool.end();
  });

  afterEach(async () => {
    await pool.query("DELETE FROM bookings WHERE mentor_id = $1", [mentorId]);
  });

  it("lets exactly one of five simultaneous requests for the identical time win", async () => {
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const attempt = (name) =>
      request(app)
        .post("/api/bookings")
        .send({ mentor_id: mentorId, start_time: start, duration: 30, name, email: `${name.toLowerCase()}@example.com` });

    const names = ["RequesterA", "RequesterB", "RequesterC", "RequesterD", "RequesterE"];
    const results = await Promise.all(names.map(attempt));

    const succeeded = results.filter((r) => r.status === 201);
    const conflicted = results.filter((r) => r.status === 409);
    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(4);

    const bookings = await pool.query("SELECT * FROM bookings WHERE mentor_id = $1", [mentorId]);
    expect(bookings.rows).toHaveLength(1);
  });

  it("blocks a 30-minute booking that starts partway through an existing 60-minute booking", async () => {
    const base = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    base.setUTCHours(10, 0, 0, 0);

    const first = await request(app)
      .post("/api/bookings")
      .send({ mentor_id: mentorId, start_time: base.toISOString(), duration: 60, name: "LongBooker", email: "long@example.com" });
    expect(first.status).toBe(201);

    // Starts 15 minutes into the 60-minute booking (10:00-11:00) — clearly overlapping.
    const overlapStart = new Date(base.getTime() + 15 * 60 * 1000).toISOString();
    const second = await request(app)
      .post("/api/bookings")
      .send({ mentor_id: mentorId, start_time: overlapStart, duration: 30, name: "ShortBooker", email: "short@example.com" });
    expect(second.status).toBe(409);

    const bookings = await pool.query("SELECT * FROM bookings WHERE mentor_id = $1", [mentorId]);
    expect(bookings.rows).toHaveLength(1);
  });

  it("rejects a booking that starts exactly when a prior booking ends (15-minute buffer)", async () => {
    const base = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    base.setUTCHours(10, 0, 0, 0);

    const first = await request(app)
      .post("/api/bookings")
      .send({ mentor_id: mentorId, start_time: base.toISOString(), duration: 60, name: "LongBooker", email: "long2@example.com" });
    expect(first.status).toBe(201);

    const adjacentStart = new Date(base.getTime() + 60 * 60 * 1000).toISOString(); // 11:00, right after
    const second = await request(app)
      .post("/api/bookings")
      .send({ mentor_id: mentorId, start_time: adjacentStart, duration: 30, name: "NextBooker", email: "next@example.com" });
    expect(second.status).toBe(409);

    const bookings = await pool.query("SELECT * FROM bookings WHERE mentor_id = $1", [mentorId]);
    expect(bookings.rows).toHaveLength(1);
  });
});
