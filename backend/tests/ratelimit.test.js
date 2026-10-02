process.env.NODE_ENV = "test";

jest.mock("../db", () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock("../lib/mailer", () => ({
  sendMail: jest.fn().mockResolvedValue({ sent: true }),
  isConfigured: jest.fn(() => true),
}));

const request = require("supertest");
const pool = require("../db");
const app = require("../server");
const { resolveCorsOrigin } = require("../lib/config");
const mailer = require("../lib/mailer");
const { whenIdle } = require("../lib/background");
const { lookupEmailLimiter } = require("../lib/mailLimits");
const { LOOKUP_MESSAGE } = require("../routes/bookings");

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue({ rows: [] });
  mailer.sendMail.mockClear();
  lookupEmailLimiter.reset();
});

const lookup = (ip, email = "a@b.com") =>
  request(app).post("/api/bookings/lookup").set("X-Forwarded-For", ip).send({ email });

describe("rate limiting", () => {
  it("limits 'email me my links' to 10 per hour per IP with a JSON 429, keyed on the client IP behind the proxy", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await lookup("203.0.113.1", `person${i}@example.com`)).status).toBe(200);
    }
    const limited = await lookup("203.0.113.1", "person11@example.com");
    expect(limited.status).toBe(429);
    expect(limited.headers["content-type"]).toMatch(/application\/json/);
    expect(limited.body.error).toMatch(/too many/i);

    // Another client behind the same proxy is unaffected (trust proxy = 1).
    expect((await lookup("203.0.113.2")).status).toBe(200);
    await whenIdle();
  });

  it("limits each email address to 5 sends per hour, silently (identical 200 each time)", async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 9, start_time: "2030-03-05T09:00:00.000Z", end_time: "2030-03-05T09:30:00.000Z", duration_minutes: 30, mentor_name: "Ama", mentor_title: "PM" }],
    });
    const bodies = [];
    for (let i = 0; i < 8; i++) {
      // A different IP each time so only the per-address limit can be what stops it.
      const res = await lookup(`198.18.0.${i + 1}`, "Target@Example.com");
      expect(res.status).toBe(200);
      bodies.push(res.body);
    }
    await whenIdle();
    for (const b of bodies) expect(b).toEqual({ message: LOOKUP_MESSAGE });
    expect(mailer.sendMail).toHaveBeenCalledTimes(5);

    // Case / whitespace variants of the same address share the budget.
    expect((await lookup("198.18.0.50", "  TARGET@example.com ")).status).toBe(200);
    await whenIdle();
    expect(mailer.sendMail).toHaveBeenCalledTimes(5);

    // A different address still gets its mail.
    await lookup("198.18.0.51", "other@example.com");
    await whenIdle();
    expect(mailer.sendMail).toHaveBeenCalledTimes(6);
  });

  it("does not let path variants dodge the lookup limiter (case, trailing slash)", async () => {
    for (const path of ["/api/bookings/LOOKUP", "/api/bookings/lookup/", "/api/Bookings/lookup"]) {
      const res = await request(app).post(path).set("X-Forwarded-For", "203.0.113.9").send({ email: "a@b.com" });
      expect(res.status).toBe(404);
    }
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it("limits the manage endpoints to 60 per 15 minutes per IP, shared by view and cancel", async () => {
    const view = (ip) => request(app).post("/api/manage/view").set("X-Forwarded-For", ip).send({ token: "nope" });
    for (let i = 0; i < 60; i++) expect((await view("203.0.113.30")).status).toBe(404);
    expect((await view("203.0.113.30")).status).toBe(429);
    const cancel = await request(app).post("/api/manage/cancel").set("X-Forwarded-For", "203.0.113.30").send({ token: "nope" });
    expect(cancel.status).toBe(429);
    expect((await view("203.0.113.31")).status).toBe(404);
  });

  it("limits POST /bookings separately", async () => {
    const post = (ip) => request(app).post("/api/bookings").set("X-Forwarded-For", ip).send({});
    for (let i = 0; i < 30; i++) {
      expect((await post("198.51.100.1")).status).toBe(400);
    }
    expect((await post("198.51.100.1")).status).toBe(429);
    expect((await post("198.51.100.2")).status).toBe(400);
    // The lookup budget is separate: 30 booking attempts didn't touch it.
    expect((await lookup("198.51.100.1")).status).toBe(200);
  });
});

describe("resolveCorsOrigin", () => {
  it("strips trailing slashes and whitespace", () => {
    expect(resolveCorsOrigin({ CORS_ORIGIN: " https://app.example.com/// " })).toBe("https://app.example.com");
  });

  it("falls back to * quietly outside production", () => {
    const warn = jest.fn();
    expect(resolveCorsOrigin({}, warn)).toBe("*");
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns in production when unset", () => {
    const warn = jest.fn();
    expect(resolveCorsOrigin({ NODE_ENV: "production" }, warn)).toBe("*");
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/CORS_ORIGIN/));
  });
});
