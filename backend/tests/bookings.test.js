process.env.NODE_ENV = "test";

jest.mock("../db", () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require("supertest");
const pool = require("../db");
const app = require("../server");

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
});

const futureStart = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

describe("POST /api/bookings", () => {
  it("rejects invalid input before touching the database", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .send({ mentor_id: "not-a-number", start_time: futureStart(), duration: 30, name: "Ama", email: "a@b.com" });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects a duration the mentor doesn't support without inserting", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Ama Boateng", title: "PM", allowed_durations: [30] }],
    });

    const res = await request(app)
      .post("/api/bookings")
      .send({ mentor_id: 1, start_time: futureStart(), duration: 60, name: "Kwesi Mensah", email: "kwesi@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/60-minute/);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("404s when the mentor doesn't exist", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/bookings")
      .send({ mentor_id: 99, start_time: futureStart(), duration: 30, name: "Kwesi Mensah", email: "kwesi@example.com" });

    expect(res.status).toBe(404);
  });

  it("books an available slot", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: "Ama Boateng", title: "PM", allowed_durations: [30, 45, 60] }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 5,
            start_time: "2026-10-02T09:00:00Z",
            end_time: "2026-10-02T09:30:00Z",
            duration_minutes: 30,
            created_at: "2026-09-30T00:00:00Z",
          },
        ],
      });

    const res = await request(app)
      .post("/api/bookings")
      .send({ mentor_id: 1, start_time: "2026-10-02T09:00:00Z", duration: 30, name: "Kwesi Mensah", email: "kwesi@example.com" });

    expect(res.status).toBe(201);
    expect(res.body.booking.mentor_name).toBe("Ama Boateng");
    expect(res.body.booking.duration_minutes).toBe(30);
  });

  it("rejects with 409 when the time range overlaps an existing booking (exclusion-constraint guard)", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Ama Boateng", title: "PM", allowed_durations: [30, 45, 60] }],
    });
    const err = new Error("conflicting key value violates exclusion constraint");
    err.code = "23P01";
    pool.query.mockRejectedValueOnce(err);

    const res = await request(app)
      .post("/api/bookings")
      .send({ mentor_id: 1, start_time: "2026-10-02T09:00:00Z", duration: 60, name: "Kwesi Mensah", email: "kwesi@example.com" });

    expect(res.status).toBe(409);
  });
});

describe("GET /api/bookings", () => {
  it("requires an email", async () => {
    const res = await request(app).get("/api/bookings");
    expect(res.status).toBe(400);
  });

  it("returns bookings for the given email", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, mentee_email: "kwesi@example.com", mentor_name: "Ama Boateng", duration_minutes: 30 }],
    });
    const res = await request(app).get("/api/bookings?email=kwesi@example.com");
    expect(res.status).toBe(200);
    expect(res.body.bookings).toHaveLength(1);
  });
});

describe("DELETE /api/bookings/:id", () => {
  it("404s when the booking doesn't exist or isn't this email's (indistinguishable)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete("/api/bookings/99").send({ email: "a@b.com" });
    expect(res.status).toBe(404);
  });

  it("cancels with a single atomic DELETE scoped to id, owner email and not-yet-started", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const res = await request(app).delete("/api/bookings/1").send({ email: "Kwesi@Example.com" });
    expect(res.status).toBe(200);
    expect(res.body.cancelled).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/^\s*DELETE FROM bookings/);
    expect(sql).toMatch(/lower\(mentee_email\) = \$2/);
    expect(sql).toMatch(/start_time > now\(\)/);
    expect(sql).toMatch(/RETURNING/);
    expect(params).toEqual([1, "kwesi@example.com"]);
  });

  it("409s when the session has already started", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    const res = await request(app).delete("/api/bookings/1").send({ email: "kwesi@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already started/);
  });
});
