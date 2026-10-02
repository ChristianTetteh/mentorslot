// Malformed / hostile input must produce a clean 4xx JSON response, never a
// crash, an unhandled rejection, a stack trace or an HTML error page.
process.env.NODE_ENV = "test";

jest.mock("../db", () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require("supertest");
const pool = require("../db");
const app = require("../server");

let unhandled;
const onUnhandled = (err) => unhandled.push(err);

beforeEach(() => {
  pool.query.mockReset();
  unhandled = [];
  process.on("unhandledRejection", onUnhandled);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await new Promise((r) => setImmediate(r));
  process.off("unhandledRejection", onUnhandled);
  expect(unhandled).toEqual([]);
  console.error.mockRestore();
});

const expectJsonError = (res, status) => {
  expect(res.status).toBe(status);
  expect(res.headers["content-type"]).toMatch(/application\/json/);
  expect(typeof res.body.error).toBe("string");
  expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js|<html|stack/i);
};

describe("non-string email input", () => {
  it("GET /bookings?email[]=a&email[]=b is a 400, not a crash", async () => {
    const res = await request(app).get("/api/bookings?email[]=a&email[]=b");
    expectJsonError(res, 400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("GET /bookings?email[x]=1 (object) is a 400", async () => {
    expectJsonError(await request(app).get("/api/bookings?email[x]=1"), 400);
  });

  it.each([[123], [["a@b.com"]], [{ a: 1 }], [null], [true]])("DELETE with body email %j is a 400", async (email) => {
    const res = await request(app).delete("/api/bookings/1").send({ email });
    expectJsonError(res, 400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("DELETE with no body is a 400", async () => {
    expectJsonError(await request(app).delete("/api/bookings/1"), 400);
  });

  it("POST with non-string name/email/start_time fields is a 400", async () => {
    for (const body of [
      { mentor_id: 1, start_time: 123, duration: 30, name: "Ama", email: "a@b.com" },
      { mentor_id: 1, start_time: "2030-01-01T09:00:00Z", duration: [30], name: "Ama", email: "a@b.com" },
      { mentor_id: [1], start_time: "2030-01-01T09:00:00Z", duration: 30, name: "Ama", email: "a@b.com" },
      { mentor_id: 1, start_time: "2030-01-01T09:00:00Z", duration: 30, name: { a: 1 }, email: "a@b.com" },
      { mentor_id: 1, start_time: "2030-01-01T09:00:00Z", duration: 30, name: "Ama", email: 5 },
    ]) {
      expectJsonError(await request(app).post("/api/bookings").send(body), 400);
    }
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("request body / routing errors", () => {
  it("malformed JSON is a 400 with a JSON error", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .set("Content-Type", "application/json")
      .send('{"email": ');
    expectJsonError(res, 400);
  });

  it("unknown /api routes get a JSON 404", async () => {
    expectJsonError(await request(app).get("/api/nope"), 404);
    expectJsonError(await request(app).post("/api/bookings/1/extra"), 404);
  });
});

describe("unexpected failures", () => {
  it("asyncHandler forwards a rejected promise to next()", async () => {
    const asyncHandler = require("../lib/asyncHandler");
    const next = jest.fn();
    const err = new Error("late failure");
    asyncHandler(async () => {
      throw err;
    })({}, {}, next);
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledWith(err);
  });

  it("an error escaping a route's own try/catch becomes a JSON 500 with no stack", async () => {
    pool.query.mockRejectedValue(new Error("db down: secret internal detail"));
    // Make the route's catch block itself throw once, so only asyncHandler +
    // the error middleware stand between this and an unhandled rejection.
    console.error.mockImplementationOnce(() => {
      throw new Error("logging failed");
    });
    const res = await request(app).get("/api/fields");
    expect(res.status).toBe(500);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: "Something went wrong" });
  });

  it("a plain database failure is a JSON 500 with the route's own message", async () => {
    pool.query.mockRejectedValue(new Error("db down"));
    const res = await request(app).get("/api/fields");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Could not load fields." });
  });
});

describe("id and numeric parameter bounds", () => {
  it.each(["0", "-1", "1.5", "1e3", "abc", "2147483648", "99999999999999999999", "%20"])(
    "rejects id %s with a 400 on every id route",
    async (id) => {
      for (const res of [
        await request(app).get(`/api/fields/${id}/mentors`),
        await request(app).get(`/api/mentors/${id}/slots`),
        await request(app).delete(`/api/bookings/${id}`).send({ email: "a@b.com" }),
      ]) {
        expectJsonError(res, 400);
      }
      expect(pool.query).not.toHaveBeenCalled();
    }
  );

  it("accepts the largest int32 id (reaches the database, 404s)", async () => {
    pool.query.mockResolvedValue({ rows: [] });
    expect((await request(app).get("/api/fields/2147483647/mentors")).status).toBe(404);
  });

  it.each(["0", "31", "-1", "1.5", "abc", "1e1", "999999999999"])("rejects days=%s with a 400", async (days) => {
    expectJsonError(await request(app).get(`/api/mentors/1/slots?days=${days}`), 400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects days[]=1 and duration[]=30 arrays", async () => {
    expectJsonError(await request(app).get("/api/mentors/1/slots?days[]=1"), 400);
    expectJsonError(await request(app).get("/api/mentors/1/slots?duration[]=30"), 400);
  });

  it("POST rejects mentor_id values outside int32", async () => {
    for (const mentor_id of [2147483648, "9999999999", 1.5, -1, "1e3"]) {
      const res = await request(app)
        .post("/api/bookings")
        .send({ mentor_id, start_time: "2030-01-01T09:00:00Z", duration: 30, name: "Ama", email: "a@b.com" });
      expectJsonError(res, 400);
    }
  });

  it("POST rejects offset-less and absurd start_time values", async () => {
    for (const start_time of ["2030-01-01T09:00:00", "2030-01-01", "+275760-09-13T00:00:00Z", "99999-01-01T00:00:00Z", "0000-01-01T00:00:00Z", "not a date", ""]) {
      const res = await request(app)
        .post("/api/bookings")
        .send({ mentor_id: 1, start_time, duration: 30, name: "Ama", email: "a@b.com" });
      expectJsonError(res, 400);
    }
    expect(pool.query).not.toHaveBeenCalled();
  });
});
