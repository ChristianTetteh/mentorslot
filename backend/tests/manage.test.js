// POST /api/manage/view and /api/manage/cancel (private-link access).
process.env.NODE_ENV = "test";

jest.mock("../db", () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require("supertest");
const pool = require("../db");
const app = require("../server");
const { createManageToken } = require("../lib/manageToken");

const NOT_FOUND = { error: "Booking not found." };
let ipCounter = 0;
const post = (path, body) => request(app).post(path).set("X-Forwarded-For", `192.0.2.${(ipCounter++ % 250) + 1}`).send(body);

const ROW = {
  id: 12,
  mentee_name: "Kwesi Mensah",
  mentee_email: "kwesi@example.com",
  start_time: "2030-03-05T09:00:00.000Z",
  end_time: "2030-03-05T09:45:00.000Z",
  duration_minutes: 45,
  mentor_name: "Ama Boateng",
  mentor_title: "Product manager",
  mentor_color: "#2F5233",
  status: "upcoming",
};

beforeEach(() => {
  pool.query.mockReset();
});

describe("token checks happen before any database access", () => {
  const good = () => createManageToken(12);
  const [id, mac] = good().split(".");
  const flip = (m) => (m[0] === "A" ? "B" : "A") + m.slice(1);
  const forged = [
    ["tampered mac", `${id}.${flip(mac)}`],
    ["another booking's mac", `13.${mac}`],
    ["malformed", "garbage"],
    ["missing mac", `${id}.`],
    ["wrong-secret token", createManageToken(12, { NODE_ENV: "test", MANAGE_SECRET: "z".repeat(40) })],
    ["a bare booking id", "12"],
    ["very long", "9".repeat(10000)],
  ];

  for (const path of ["/api/manage/view", "/api/manage/cancel"]) {
    it.each(forged)(`${path}: ${"%s"} gets the generic 404 and no query`, async (_label, token) => {
      const res = await post(path, { token });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
      expect(pool.query).not.toHaveBeenCalled();
    });
  }

  it("a token in the query string or URL is never read", async () => {
    const res = await request(app).post(`/api/manage/view?token=${good()}`).send({});
    expect(res.status).toBe(400);
    expect((await request(app).get(`/api/manage/view?token=${good()}`)).status).toBe(404);
    expect((await request(app).post(`/api/manage/view/${good()}`).send({})).status).toBe(404);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("POST /api/manage/view", () => {
  it("returns the booking for a genuine token, with the name and email minimised", async () => {
    pool.query.mockResolvedValueOnce({ rows: [ROW] });
    const res = await post("/api/manage/view", { token: createManageToken(12) });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual({
      booking: {
        mentor_name: "Ama Boateng",
        mentor_title: "Product manager",
        mentor_color: "#2F5233",
        start_time: ROW.start_time,
        end_time: ROW.end_time,
        duration_minutes: 45,
        status: "upcoming",
        mentee_first_name: "Kwesi",
        mentee_email_masked: "k***@example.com",
      },
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("kwesi@example.com");
    expect(text).not.toContain("Mensah");
    const [sql, params] = pool.query.mock.calls[0];
    expect(params).toEqual([12]);
    expect(sql).toMatch(/WHERE b\.id = \$1/);
  });

  it.each(["upcoming", "started", "past"])("passes through status %s", async (status) => {
    pool.query.mockResolvedValueOnce({ rows: [{ ...ROW, status }] });
    const res = await post("/api/manage/view", { token: createManageToken(12) });
    expect(res.body.booking.status).toBe(status);
  });

  it("is the same generic 404 for a genuine token whose booking no longer exists", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await post("/api/manage/view", { token: createManageToken(12) });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  it("500s with a generic JSON message on a database failure", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    pool.query.mockRejectedValueOnce(new Error("db down"));
    const res = await post("/api/manage/view", { token: createManageToken(12) });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Could not load the booking." });
    console.error.mockRestore();
  });
});

describe("POST /api/manage/cancel", () => {
  it("cancels with ONE atomic DELETE ... RETURNING scoped to id and not-yet-started", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 12 }] });
    const res = await post("/api/manage/cancel", { token: createManageToken(12) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cancelled: true });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/^\s*DELETE FROM bookings/);
    expect(sql).toMatch(/start_time > now\(\)/);
    expect(sql).toMatch(/RETURNING/);
    expect(params).toEqual([12]);
  });

  it("409s with a clear message once the session has started", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const res = await post("/api/manage/cancel", { token: createManageToken(12) });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("That session has already started, so it can't be cancelled.");
  });

  it("a second cancel is the same generic 404 as any unknown link", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 12 }] });
    expect((await post("/api/manage/cancel", { token: createManageToken(12) })).status).toBe(200);
    pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const again = await post("/api/manage/cancel", { token: createManageToken(12) });
    expect(again.status).toBe(404);
    expect(again.body).toEqual(NOT_FOUND);
  });

  it("500s generically on a database failure", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    pool.query.mockRejectedValueOnce(new Error("db down"));
    const res = await post("/api/manage/cancel", { token: createManageToken(12) });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Could not cancel the booking." });
    console.error.mockRestore();
  });
});
