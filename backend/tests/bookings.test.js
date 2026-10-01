process.env.NODE_ENV = "test";

jest.mock("../db", () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require("supertest");
const pool = require("../db");
const app = require("../server");

function makeClient(queryImpl) {
  return { query: jest.fn(queryImpl), release: jest.fn() };
}

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
});

describe("POST /api/bookings", () => {
  it("rejects invalid input before touching the database", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .send({ slot_id: "not-a-number", name: "Ama", email: "a@b.com" });
    expect(res.status).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("books an available slot", async () => {
    const client = makeClient((sql) => {
      if (sql.startsWith("BEGIN")) return Promise.resolve();
      if (sql.startsWith("UPDATE slots")) {
        return Promise.resolve({
          rowCount: 1,
          rows: [{ mentor_id: 1, start_time: "2026-10-01T09:00:00Z", end_time: "2026-10-01T09:30:00Z" }],
        });
      }
      if (sql.startsWith("INSERT INTO bookings")) {
        return Promise.resolve({ rows: [{ id: 5, created_at: "2026-09-30T00:00:00Z" }] });
      }
      if (sql.startsWith("SELECT name, title")) {
        return Promise.resolve({ rows: [{ name: "Ama Boateng", title: "PM" }] });
      }
      if (sql.startsWith("COMMIT")) return Promise.resolve();
      return Promise.resolve({ rows: [] });
    });
    pool.connect.mockResolvedValueOnce(client);

    const res = await request(app)
      .post("/api/bookings")
      .send({ slot_id: 10, name: "Kwesi Mensah", email: "kwesi@example.com" });

    expect(res.status).toBe(201);
    expect(res.body.booking.mentor_name).toBe("Ama Boateng");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("rejects with 409 when the slot is already booked (the double-booking guard)", async () => {
    const client = makeClient((sql) => {
      if (sql.startsWith("BEGIN")) return Promise.resolve();
      if (sql.startsWith("UPDATE slots")) return Promise.resolve({ rowCount: 0, rows: [] });
      if (sql.startsWith("ROLLBACK")) return Promise.resolve();
      return Promise.resolve({ rows: [] });
    });
    pool.connect.mockResolvedValueOnce(client);

    const res = await request(app)
      .post("/api/bookings")
      .send({ slot_id: 10, name: "Kwesi Mensah", email: "kwesi@example.com" });

    expect(res.status).toBe(409);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rejects with 409 on a unique-constraint violation as a second line of defense", async () => {
    const client = makeClient((sql) => {
      if (sql.startsWith("BEGIN")) return Promise.resolve();
      if (sql.startsWith("UPDATE slots")) {
        return Promise.resolve({
          rowCount: 1,
          rows: [{ mentor_id: 1, start_time: "2026-10-01T09:00:00Z", end_time: "2026-10-01T09:30:00Z" }],
        });
      }
      if (sql.startsWith("INSERT INTO bookings")) {
        const err = new Error("duplicate key value violates unique constraint");
        err.code = "23505";
        return Promise.reject(err);
      }
      if (sql.startsWith("ROLLBACK")) return Promise.resolve();
      return Promise.resolve({ rows: [] });
    });
    pool.connect.mockResolvedValueOnce(client);

    const res = await request(app)
      .post("/api/bookings")
      .send({ slot_id: 10, name: "Kwesi Mensah", email: "kwesi@example.com" });

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
      rows: [{ id: 1, mentee_email: "kwesi@example.com", mentor_name: "Ama Boateng" }],
    });
    const res = await request(app).get("/api/bookings?email=kwesi@example.com");
    expect(res.status).toBe(200);
    expect(res.body.bookings).toHaveLength(1);
  });
});

describe("DELETE /api/bookings/:id", () => {
  it("404s when the booking doesn't exist", async () => {
    const client = makeClient((sql) => {
      if (sql.startsWith("BEGIN")) return Promise.resolve();
      if (sql.startsWith("SELECT slot_id")) return Promise.resolve({ rows: [] });
      if (sql.startsWith("ROLLBACK")) return Promise.resolve();
      return Promise.resolve({ rows: [] });
    });
    pool.connect.mockResolvedValueOnce(client);

    const res = await request(app).delete("/api/bookings/99").send({ email: "a@b.com" });
    expect(res.status).toBe(404);
  });

  it("rejects cancelling someone else's booking", async () => {
    const client = makeClient((sql) => {
      if (sql.startsWith("BEGIN")) return Promise.resolve();
      if (sql.startsWith("SELECT slot_id")) {
        return Promise.resolve({ rows: [{ slot_id: 10, mentee_email: "other@example.com" }] });
      }
      if (sql.startsWith("ROLLBACK")) return Promise.resolve();
      return Promise.resolve({ rows: [] });
    });
    pool.connect.mockResolvedValueOnce(client);

    const res = await request(app).delete("/api/bookings/1").send({ email: "kwesi@example.com" });
    expect(res.status).toBe(403);
  });

  it("cancels the booking and frees the slot", async () => {
    const client = makeClient((sql) => {
      if (sql.startsWith("BEGIN")) return Promise.resolve();
      if (sql.startsWith("SELECT slot_id")) {
        return Promise.resolve({ rows: [{ slot_id: 10, mentee_email: "kwesi@example.com" }] });
      }
      if (sql.startsWith("DELETE FROM bookings")) return Promise.resolve({ rowCount: 1 });
      if (sql.startsWith("UPDATE slots")) return Promise.resolve({ rowCount: 1 });
      if (sql.startsWith("COMMIT")) return Promise.resolve();
      return Promise.resolve({ rows: [] });
    });
    pool.connect.mockResolvedValueOnce(client);

    const res = await request(app).delete("/api/bookings/1").send({ email: "kwesi@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.cancelled).toBe(true);
  });
});
