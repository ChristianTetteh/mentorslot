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
const { confirmEmailLimiter } = require("../lib/mailLimits");
const { verifyManageToken } = require("../lib/manageToken");
const { useFixedClock, isoAt } = require("./helpers/clock");

useFixedClock();

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
  mailer.sendMail.mockClear();
  mailer.isConfigured.mockReturnValue(true);
  confirmEmailLimiter.reset();
});

// Tomorrow 09:00 UTC: a real grid slot under the fixed fake clock.
const futureStart = () => isoAt(1, 9, 0);

describe("POST /api/bookings", () => {
  it("rejects invalid input before touching the database", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .send({ mentor_id: "not-a-number", start_time: futureStart(), duration: 30, name: "Ama", email: "a@b.com" });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects a start time that isn't on the offered grid without touching the database", async () => {
    for (const start_time of [isoAt(1, 9, 30), isoAt(5, 9, 0), isoAt(1, 8, 0), isoAt(31, 9, 0), isoAt(0, 15, 0)]) {
      const res = await request(app)
        .post("/api/bookings")
        .send({ mentor_id: 1, start_time, duration: 30, name: "Kwesi Mensah", email: "kwesi@example.com" });
      expect(res.status).toBe(400);
    }
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
            start_time: isoAt(1, 9, 0),
            end_time: isoAt(1, 9, 30),
            duration_minutes: 30,
            created_at: isoAt(0, 9, 0),
          },
        ],
      });

    const res = await request(app)
      .post("/api/bookings")
      .send({ mentor_id: 1, start_time: futureStart(), duration: 30, name: "Kwesi Mensah", email: "kwesi@example.com" });

    expect(res.status).toBe(201);
    expect(res.body.booking.mentor_name).toBe("Ama Boateng");
    expect(res.body.booking.duration_minutes).toBe(30);
  });

  describe("private manage link", () => {
    const mockSuccessfulInsert = () =>
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: "Ama Boateng", title: "PM", allowed_durations: [30, 45, 60] }] })
        .mockResolvedValueOnce({
          rows: [{ id: 5, start_time: isoAt(1, 9, 0), end_time: isoAt(1, 9, 30), duration_minutes: 30, created_at: isoAt(0, 9, 0) }],
        });
    const book = (over = {}) =>
      request(app)
        .post("/api/bookings")
        .send({ mentor_id: 1, start_time: futureStart(), duration: 30, name: "Kwesi Mensah", email: "kwesi@example.com", ...over });

    it("returns a manage_token for the new booking (and only a genuine one verifies)", async () => {
      mockSuccessfulInsert();
      const res = await book();
      expect(res.status).toBe(201);
      expect(typeof res.body.manage_token).toBe("string");
      expect(verifyManageToken(res.body.manage_token)).toBe(5);
      expect(res.body.manage_token).toMatch(/^5\.[A-Za-z0-9_-]{43}$/);
      // Nothing about the token is persisted: a single INSERT, no token column.
      const insertSql = pool.query.mock.calls[1][0];
      expect(insertSql).not.toMatch(/token/i);
    });

    it("emails a confirmation after the booking, and says emailed: true when a provider is configured", async () => {
      mockSuccessfulInsert();
      const res = await book();
      await whenIdle();
      expect(res.body.emailed).toBe(true);
      expect(mailer.sendMail).toHaveBeenCalledTimes(1);
      const mail = mailer.sendMail.mock.calls[0][0];
      expect(mail.to).toBe("kwesi@example.com");
      expect(mail.text).toContain(`/manage#${res.body.manage_token}`);
      expect(mail.text).toContain("Ama Boateng");
      expect(mail.text).toContain("30-minute");
      expect(mail.text).toContain("UTC");
      expect(mail.text).toContain("2030-03-05T09:00:00Z");
      expect(mail.text).toContain("Anyone with this link can cancel the booking, so don't forward it.");
    });

    it("says emailed: false when no provider is configured (the booking still succeeds)", async () => {
      mailer.isConfigured.mockReturnValue(false);
      mockSuccessfulInsert();
      const res = await book();
      expect(res.status).toBe(201);
      expect(res.body.emailed).toBe(false);
      expect(res.body.manage_token).toBeTruthy();
    });

    it("never fails the booking when sending throws or rejects", async () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      for (const failure of [() => Promise.reject(new Error("smtp down")), () => { throw new Error("sync boom"); }]) {
        mockSuccessfulInsert();
        mailer.sendMail.mockImplementationOnce(failure);
        const res = await book({ email: `x${Math.random().toString(36).slice(2)}@example.com` });
        await whenIdle();
        expect(res.status).toBe(201);
        expect(res.body.manage_token).toBeTruthy();
      }
      errorSpy.mockRestore();
    });

    it("does not send for a booking that was refused (400 / 404 / 409)", async () => {
      await book({ name: "" });
      pool.query.mockResolvedValueOnce({ rows: [] });
      await book();
      pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: "A", title: "B", allowed_durations: [30] }] });
      pool.query.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "23P01" }));
      const conflict = await book();
      await whenIdle();
      expect(conflict.status).toBe(409);
      expect(conflict.body.manage_token).toBeUndefined();
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    it("builds the link from FRONTEND_ORIGIN, ignoring a forged Host / X-Forwarded-Host", async () => {
      process.env.FRONTEND_ORIGIN = "https://app.example.test/";
      try {
        mockSuccessfulInsert();
        const res = await request(app)
          .post("/api/bookings")
          .set("Host", "evil.example")
          .set("X-Forwarded-Host", "evil.example")
          .set("Origin", "https://evil.example")
          .send({ mentor_id: 1, start_time: futureStart(), duration: 30, name: "Kwesi Mensah", email: "kwesi@example.com" });
        await whenIdle();
        const { text, html } = mailer.sendMail.mock.calls[0][0];
        expect(text).toContain(`https://app.example.test/manage#${res.body.manage_token}`);
        expect(html).toContain(`https://app.example.test/manage#${res.body.manage_token}`);
        expect(text).not.toMatch(/evil/);
        expect(html).not.toMatch(/evil/);
      } finally {
        delete process.env.FRONTEND_ORIGIN;
      }
    });

    it("caps confirmation emails per recipient (the booking still works, emailed turns false)", async () => {
      const results = [];
      for (let i = 0; i < 6; i++) {
        mockSuccessfulInsert();
        results.push(await book({ email: "victim@example.com" }));
      }
      await whenIdle();
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(results.map((r) => r.body.emailed)).toEqual([true, true, true, true, true, false]);
      expect(mailer.sendMail).toHaveBeenCalledTimes(5);
    });

    it("HTML-escapes mentor details in the email and never echoes the booker's typed name", async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: "<b>Ama</b> & Co", title: "PM", allowed_durations: [30] }] })
        .mockResolvedValueOnce({
          rows: [{ id: 5, start_time: isoAt(1, 9, 0), end_time: isoAt(1, 9, 30), duration_minutes: 30, created_at: isoAt(0, 9, 0) }],
        });
      await book({ name: "Click http://evil.example now" });
      await whenIdle();
      const { text, html } = mailer.sendMail.mock.calls[0][0];
      expect(html).toContain("&lt;b&gt;Ama&lt;/b&gt; &amp; Co");
      expect(html).not.toContain("<b>Ama</b>");
      expect(text + html).not.toMatch(/evil\.example/);
    });
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
      .send({ mentor_id: 1, start_time: futureStart(), duration: 60, name: "Kwesi Mensah", email: "kwesi@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/too close|overlaps/);
  });
});

describe("the old email-as-credential routes are gone", () => {
  it("GET /api/bookings?email= is a 404 and never queries the database", async () => {
    const res = await request(app).get("/api/bookings?email=kwesi@example.com");
    expect(res.status).toBe(404);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("DELETE /api/bookings/:id (with an email) is a 404 and never queries the database", async () => {
    const res = await request(app).delete("/api/bookings/1").send({ email: "kwesi@example.com" });
    expect(res.status).toBe(404);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
