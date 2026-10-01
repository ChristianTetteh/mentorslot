process.env.NODE_ENV = "test";

jest.mock("../db", () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require("supertest");
const pool = require("../db");
const app = require("../server");

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
      .mockResolvedValueOnce({ rows: [{ id: 1, name: "Ama Boateng", title: "PM", color: "#2DD4BF", allowed_durations: [30, 45, 60] }] })
      .mockResolvedValueOnce({
        // A booking covering every grid start on the first available day blocks all of it.
        rows: [{ start_time: "2026-10-02T00:00:00Z", end_time: "2026-12-01T00:00:00Z" }],
      });
    const res = await request(app).get("/api/mentors/1/slots?duration=30&days=1");
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(0);
  });
});
