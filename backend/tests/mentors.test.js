process.env.NODE_ENV = "test";

jest.mock("../db", () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require("supertest");
const pool = require("../db");
const app = require("../server");
const { useFixedClock, isoAt, FIXED_NOW } = require("./helpers/clock");
const { validateBookingInput } = require("../lib/validation");

useFixedClock();

const MENTOR = { id: 1, name: "Ama Boateng", title: "PM", color: "#2DD4BF", allowed_durations: [30, 45, 60] };
const times = (res) => res.body.slots.map((s) => s.start_time.slice(11, 16));

beforeEach(() => {
  pool.query.mockReset();
});

describe("GET /api/mentors", () => {
  it("returns the mentor list", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Ama Boateng", title: "PM", bio: "...", color: "#2DD4BF", field_id: 1, allowed_durations: [30, 45] }],
    });
    const res = await request(app).get("/api/mentors");
    expect(res.status).toBe(200);
    expect(res.body.mentors).toHaveLength(1);
  });
});

describe("GET /api/mentors/:id/slots", () => {
  it("rejects a non-numeric id", async () => {
    const res = await request(app).get("/api/mentors/abc/slots");
    expect(res.status).toBe(400);
  });

  it("rejects an invalid duration", async () => {
    const res = await request(app).get("/api/mentors/1/slots?duration=20");
    expect(res.status).toBe(400);
  });

  it("404s when the mentor doesn't exist", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/api/mentors/99/slots");
    expect(res.status).toBe(404);
  });

  it("400s when the mentor doesn't offer the requested duration", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Ama Boateng", title: "PM", color: "#2DD4BF", allowed_durations: [30] }],
    });
    const res = await request(app).get("/api/mentors/1/slots?duration=60");
    expect(res.status).toBe(400);
    expect(res.body.allowed_durations).toEqual([30]);
  });

  it("returns the mentor and their available slots for the default duration", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: "Ama Boateng", title: "PM", color: "#2DD4BF", allowed_durations: [30, 45, 60] }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/api/mentors/1/slots");
    expect(res.status).toBe(200);
    expect(res.body.mentor.name).toBe("Ama Boateng");
    expect(res.body.duration).toBe(30);
    expect(Array.isArray(res.body.slots)).toBe(true);
  });

  it("filters out candidate slots that overlap an existing booking", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [MENTOR] })
      .mockResolvedValueOnce({
        // One booking covering all of tomorrow (the only day with days=1) blocks every slot.
        rows: [{ start_time: isoAt(1, 0, 0), end_time: isoAt(2, 0, 0) }],
      });
    const res = await request(app).get("/api/mentors/1/slots?duration=30&days=1");
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(0);
  });

  it("lists the full grid for tomorrow when nothing is booked", async () => {
    pool.query.mockResolvedValueOnce({ rows: [MENTOR] }).mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/api/mentors/1/slots?duration=30&days=1");
    expect(times(res)).toEqual(["09:00", "09:45", "10:30", "11:15", "13:00", "13:45", "14:30", "15:15", "16:00"]);
  });

  it("asks the database for bookings relative to the app clock, padded by the buffer", async () => {
    pool.query.mockResolvedValueOnce({ rows: [MENTOR] }).mockResolvedValueOnce({ rows: [] });
    await request(app).get("/api/mentors/1/slots?days=2");
    const [sql, params] = pool.query.mock.calls[1];
    expect(sql).not.toMatch(/now\(\)|CURRENT_DATE/);
    expect(params[0]).toBe(1);
    expect(params[1]).toEqual(new Date(FIXED_NOW.getTime() - 15 * 60000));
    expect(params[2]).toEqual(new Date(new Date(isoAt(3, 0, 0)).getTime() + 15 * 60000));
  });

  it("keeps a 15-minute buffer around existing bookings, whatever the duration mix", async () => {
    const booked = { rows: [{ start_time: isoAt(1, 9, 45), end_time: isoAt(1, 10, 15) }] }; // a 30-minute session

    pool.query.mockResolvedValueOnce({ rows: [MENTOR] }).mockResolvedValueOnce(booked);
    const thirty = await request(app).get("/api/mentors/1/slots?duration=30&days=1");
    // 09:00-09:30 and 10:30-11:00 are exactly 15 minutes clear, so they stay; 09:45 itself goes.
    expect(times(thirty).slice(0, 3)).toEqual(["09:00", "10:30", "11:15"]);

    pool.query.mockResolvedValueOnce({ rows: [MENTOR] }).mockResolvedValueOnce(booked);
    const sixty = await request(app).get("/api/mentors/1/slots?duration=60&days=1");
    // 09:00-10:00 runs into the booking's buffer; 10:15-11:15 starts the instant it ends: both blocked.
    expect(times(sixty)).toEqual(["13:00", "14:15", "15:30"]);

    pool.query.mockResolvedValueOnce({ rows: [MENTOR] }).mockResolvedValueOnce(booked);
    const fortyFive = await request(app).get("/api/mentors/1/slots?duration=45&days=1");
    // 09:00-09:45 ends exactly when the booking starts (no gap): blocked. 10:00 starts inside the buffer: blocked.
    expect(times(fortyFive)).toEqual(["11:00", "13:00", "14:00", "15:00", "16:00"]);
  });

  it("only lists slots that booking validation would accept", async () => {
    for (const duration of [30, 45, 60]) {
      pool.query.mockResolvedValueOnce({ rows: [MENTOR] }).mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get(`/api/mentors/1/slots?duration=${duration}&days=30`);
      expect(res.body.slots.length).toBeGreaterThan(0);
      for (const slot of res.body.slots) {
        const result = validateBookingInput({
          mentor_id: 1, start_time: slot.start_time, duration, name: "Ama", email: "a@b.com",
        });
        expect(result.error).toBeUndefined();
      }
    }
  });
});
