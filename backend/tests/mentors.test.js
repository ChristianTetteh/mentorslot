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
      rows: [{ id: 1, name: "Ama Boateng", title: "PM", bio: "...", color: "#2DD4BF" }],
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

  it("404s when the mentor doesn't exist", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/api/mentors/99/slots");
    expect(res.status).toBe(404);
  });

  it("returns the mentor and their available slots", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: "Ama Boateng", title: "PM", color: "#2DD4BF" }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, start_time: "2026-10-01T09:00:00Z", end_time: "2026-10-01T09:30:00Z" }] });
    const res = await request(app).get("/api/mentors/1/slots");
    expect(res.status).toBe(200);
    expect(res.body.mentor.name).toBe("Ama Boateng");
    expect(res.body.slots).toHaveLength(1);
  });
});
