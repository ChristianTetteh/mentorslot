// Real-database proof that two simultaneous booking attempts on the same
// slot cannot both succeed. This talks to an actual Postgres instance (not
// mocked), because the guarantee we're proving lives in Postgres's row
// locking, not in JS — a mocked test can't demonstrate that.
//
// Skipped automatically unless TEST_DATABASE_URL is set, so the default
// `npm test` run stays fully offline. Run explicitly with:
//   TEST_DATABASE_URL=postgres://... npm run test:concurrency

const hasDb = !!process.env.TEST_DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("concurrent booking attempts on the same slot (real Postgres)", () => {
  let pool;
  let app;
  let request;
  let mentorId;
  let slotId;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.PGSSL = process.env.TEST_PGSSL || "false";
    process.env.NODE_ENV = "test";

    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
    });

    const fs = require("fs");
    const path = require("path");
    await pool.query(fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8"));

    const mentor = await pool.query(
      `INSERT INTO mentors (name, title, bio, color) VALUES ('Test Mentor', 'Test', 'Test bio', '#000000') RETURNING id`
    );
    mentorId = mentor.rows[0].id;

    const slot = await pool.query(
      `INSERT INTO slots (mentor_id, start_time, end_time) VALUES ($1, now() + interval '1 day', now() + interval '1 day 30 minutes') RETURNING id`,
      [mentorId]
    );
    slotId = slot.rows[0].id;

    request = require("supertest");
    // Fresh require so the app picks up the env vars set above.
    jest.resetModules();
    app = require("../server");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM mentors WHERE id = $1", [mentorId]);
    await pool.end();
  });

  it("lets exactly one of five simultaneous requests for the same slot win", async () => {
    const attempt = (name) =>
      request(app)
        .post("/api/bookings")
        .send({ slot_id: slotId, name, email: `${name.toLowerCase()}@example.com` });

    const names = ["RequesterA", "RequesterB", "RequesterC", "RequesterD", "RequesterE"];
    const results = await Promise.all(names.map(attempt));

    const succeeded = results.filter((r) => r.status === 201);
    const conflicted = results.filter((r) => r.status === 409);
    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(4);

    const bookings = await pool.query("SELECT * FROM bookings WHERE slot_id = $1", [slotId]);
    expect(bookings.rows).toHaveLength(1);

    const slot = await pool.query("SELECT status FROM slots WHERE id = $1", [slotId]);
    expect(slot.rows[0].status).toBe("booked");
  });
});
