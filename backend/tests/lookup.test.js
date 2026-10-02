// POST /api/bookings/lookup ("Email me my links").
process.env.NODE_ENV = "test";

jest.mock("../db", () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock("../lib/mailer", () => ({
  sendMail: jest.fn().mockResolvedValue({ sent: true }),
  isConfigured: jest.fn(() => true),
}));

const request = require("supertest");
const pool = require("../db");
const app = require("../server");
const mailer = require("../lib/mailer");
const { whenIdle } = require("../lib/background");
const { lookupEmailLimiter } = require("../lib/mailLimits");
const { verifyManageToken } = require("../lib/manageToken");

const GENERIC = { message: "If we have upcoming bookings for that email, we've sent the links." };
let ipCounter = 0;
const lookup = (email, headers = {}) => {
  const r = request(app).post("/api/bookings/lookup").set("X-Forwarded-For", `198.51.100.${(ipCounter++ % 250) + 1}`);
  for (const [k, v] of Object.entries(headers)) r.set(k, v);
  return r.send({ email });
};

const row = (id, hour, extra = {}) => ({
  id,
  start_time: `2030-03-05T${String(hour).padStart(2, "0")}:00:00.000Z`,
  end_time: `2030-03-05T${String(hour).padStart(2, "0")}:30:00.000Z`,
  duration_minutes: 30,
  mentor_name: "Ama Boateng",
  mentor_title: "Product manager",
  ...extra,
});

beforeEach(() => {
  pool.query.mockReset();
  mailer.sendMail.mockClear();
  mailer.isConfigured.mockReturnValue(true);
  lookupEmailLimiter.reset();
  process.env.FRONTEND_ORIGIN = "https://app.example.test";
});
afterEach(() => {
  delete process.env.FRONTEND_ORIGIN;
});

describe("POST /api/bookings/lookup", () => {
  it("gives the identical 200 whether or not the address has bookings", async () => {
    pool.query.mockResolvedValueOnce({ rows: [row(5, 9)] });
    const known = await lookup("known@example.com");
    pool.query.mockResolvedValueOnce({ rows: [] });
    const unknown = await lookup("nobody@example.com");
    await whenIdle();
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(GENERIC);
    expect(unknown.body).toEqual(GENERIC);
    expect(known.text).toBe(unknown.text);
    expect(Object.keys(known.headers).filter((h) => !["date", "x-ratelimit-remaining", "ratelimit-remaining", "etag"].includes(h)).sort())
      .toEqual(Object.keys(unknown.headers).filter((h) => !["date", "x-ratelimit-remaining", "ratelimit-remaining", "etag"].includes(h)).sort());
  });

  it("answers before any database work or sending happens (no timing difference to observe)", async () => {
    let releaseQuery;
    pool.query.mockReturnValueOnce(new Promise((resolve) => { releaseQuery = resolve; }));
    const res = await lookup("slow@example.com"); // resolves even though the query hasn't
    expect(res.status).toBe(200);
    expect(mailer.sendMail).not.toHaveBeenCalled();
    releaseQuery({ rows: [row(5, 9)] });
    await whenIdle();
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
  });

  it("sends ONE email listing every upcoming booking with its recomputed manage link", async () => {
    pool.query.mockResolvedValueOnce({ rows: [row(5, 9), row(8, 13, { mentor_name: "Kofi Annan Jr", duration_minutes: 45 })] });
    await lookup("  Kwesi@Example.COM ");
    await whenIdle();

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const mail = mailer.sendMail.mock.calls[0][0];
    expect(mail.to).toBe("kwesi@example.com");
    expect(mail.subject).toBe("Your MentorSlot booking links");

    const [sql, params] = pool.query.mock.calls[0];
    expect(params).toEqual(["kwesi@example.com"]);
    expect(sql).toMatch(/start_time > now\(\)/);

    const links = [...mail.text.matchAll(/Link: (\S+)/g)].map((m) => m[1]);
    expect(links).toHaveLength(2);
    expect(links.map((l) => verifyManageToken(l.split("#")[1]))).toEqual([5, 8]);
    for (const l of links) expect(l).toMatch(/^https:\/\/app\.example\.test\/manage#\d+\.[A-Za-z0-9_-]{43}$/);
    expect(mail.text).toContain("Ama Boateng");
    expect(mail.text).toContain("Kofi Annan Jr");
    expect(mail.text).toContain("Tuesday 5 March 2030, 09:00–09:30 UTC");
    expect(mail.text).toContain("2030-03-05T09:00:00Z");
    expect(mail.text).toContain("Anyone with this link can cancel the booking, so don't forward it.");
    expect(mail.html).toContain("https://app.example.test/manage#5.");
    expect(mail.html).toContain("Anyone with this link can cancel the booking, so don&#39;t forward it.");
    // The token is in the fragment, never a query string.
    expect(mail.text).not.toMatch(/\?token|[?&]t=/);
  });

  it("sends nothing for an address with no upcoming bookings", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await lookup("nobody@example.com");
    await whenIdle();
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it("builds links from FRONTEND_ORIGIN even when Host / X-Forwarded-Host / Origin / Referer are forged", async () => {
    pool.query.mockResolvedValueOnce({ rows: [row(5, 9)] });
    await lookup("kwesi@example.com", {
      Host: "evil.example",
      "X-Forwarded-Host": "evil.example",
      "X-Forwarded-Proto": "http",
      Forwarded: "host=evil.example",
      Origin: "https://evil.example",
      Referer: "https://evil.example/x",
    });
    await whenIdle();
    const { text, html } = mailer.sendMail.mock.calls[0][0];
    expect(text).toContain("https://app.example.test/manage#5.");
    expect(text + html).not.toMatch(/evil/);
  });

  it("falls back to the first CORS_ORIGIN value when FRONTEND_ORIGIN is unset", async () => {
    delete process.env.FRONTEND_ORIGIN;
    process.env.CORS_ORIGIN = "https://first.example.test, https://second.example.test";
    try {
      pool.query.mockResolvedValueOnce({ rows: [row(5, 9)] });
      await lookup("kwesi@example.com");
      await whenIdle();
      expect(mailer.sendMail.mock.calls[0][0].text).toContain("https://first.example.test/manage#5.");
    } finally {
      delete process.env.CORS_ORIGIN;
    }
  });

  it("503s with the 'email isn't set up' message when no provider is configured, without touching the database", async () => {
    mailer.isConfigured.mockReturnValue(false);
    const res = await lookup("kwesi@example.com");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: "Email isn't set up on this server yet, so links can't be sent. Use the private link shown when you booked.",
    });
    await whenIdle();
    expect(pool.query).not.toHaveBeenCalled();
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });

  it("503 depends only on configuration, so it is identical for every address", async () => {
    mailer.isConfigured.mockReturnValue(false);
    const a = await lookup("known@example.com");
    const b = await lookup("unknown@example.com");
    expect(a.status).toBe(b.status);
    expect(a.text).toBe(b.text);
  });

  it("still answers 200 (and logs, without the link) when the lookup query or the send fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    pool.query.mockRejectedValueOnce(new Error("db down"));
    const first = await lookup("a@example.com");
    pool.query.mockResolvedValueOnce({ rows: [row(5, 9)] });
    mailer.sendMail.mockRejectedValueOnce(new Error("provider down"));
    const second = await lookup("b@example.com");
    await whenIdle();
    expect(first.body).toEqual(GENERIC);
    expect(second.body).toEqual(GENERIC);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/manage#|example\.com/);
    errorSpy.mockRestore();
  });

  it("doesn't use more than 25 rows in the email (LIMIT)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await lookup("a@example.com");
    await whenIdle();
    expect(pool.query.mock.calls[0][0]).toMatch(/LIMIT 25/);
  });
});
