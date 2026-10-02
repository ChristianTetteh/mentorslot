process.env.NODE_ENV = "test";

jest.mock("../db", () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require("supertest");
const pool = require("../db");
const app = require("../server");
const { resolveCorsOrigin } = require("../lib/config");

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue({ rows: [] });
});

const lookup = (ip) => request(app).get("/api/bookings?email=a@b.com").set("X-Forwarded-For", ip);

describe("rate limiting", () => {
  it("limits email lookups and cancels to 30 per 15 min, keyed on the client IP behind the proxy", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await lookup("203.0.113.1")).status).toBe(200);
    }
    const limited = await lookup("203.0.113.1");
    expect(limited.status).toBe(429);
    expect(limited.headers["content-type"]).toMatch(/application\/json/);
    expect(limited.body.error).toMatch(/too many/i);

    // DELETE shares the lookup budget for that IP...
    const del = await request(app).delete("/api/bookings/1").set("X-Forwarded-For", "203.0.113.1").send({ email: "a@b.com" });
    expect(del.status).toBe(429);

    // ...but another client behind the same proxy is unaffected (trust proxy = 1).
    expect((await lookup("203.0.113.2")).status).toBe(200);
  });

  it("limits POST /bookings separately", async () => {
    const post = (ip) => request(app).post("/api/bookings").set("X-Forwarded-For", ip).send({});
    for (let i = 0; i < 30; i++) {
      expect((await post("198.51.100.1")).status).toBe(400);
    }
    expect((await post("198.51.100.1")).status).toBe(429);
    expect((await post("198.51.100.2")).status).toBe(400);
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
