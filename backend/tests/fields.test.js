process.env.NODE_ENV = "test";

jest.mock("../db", () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require("supertest");
const pool = require("../db");
const app = require("../server");

beforeEach(() => {
  pool.query.mockReset();
});

describe("GET /api/fields", () => {
  it("returns fields with mentor counts", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Tech & IT", slug: "tech-it", color: "#2F5233", mentor_count: 4 }],
    });
    const res = await request(app).get("/api/fields");
    expect(res.status).toBe(200);
    expect(res.body.fields).toHaveLength(1);
    expect(res.body.fields[0].mentor_count).toBe(4);
  });
});

describe("GET /api/fields/:id/mentors", () => {
  it("rejects a non-numeric id", async () => {
    const res = await request(app).get("/api/fields/abc/mentors");
    expect(res.status).toBe(400);
  });

  it("404s when the field doesn't exist", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/api/fields/99/mentors");
    expect(res.status).toBe(404);
  });

  it("returns the field and its mentors", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: "Tech & IT", slug: "tech-it", color: "#2F5233" }] })
      .mockResolvedValueOnce({
        rows: [{ id: 1, name: "Ama Boateng", title: "PM", bio: "...", color: "#2F5233" }],
      });
    const res = await request(app).get("/api/fields/1/mentors");
    expect(res.status).toBe(200);
    expect(res.body.field.name).toBe("Tech & IT");
    expect(res.body.mentors).toHaveLength(1);
  });
});
