// The private token must never reach server logs or request URLs. This runs
// the whole flow (book -> view -> cancel -> lookup) with the REAL mailer
// pointed at a fake fetch, recording everything written to the console and to
// stdout/stderr.
process.env.NODE_ENV = "test";
process.env.BREVO_API_KEY = "xkeysib-SECRET-KEY-123";
process.env.MAIL_FROM = "bookings@example.com";
process.env.FRONTEND_ORIGIN = "https://app.example.test";

jest.mock("../db", () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require("supertest");
const pool = require("../db");
const app = require("../server");
const { whenIdle } = require("../lib/background");
const { useFixedClock, isoAt } = require("./helpers/clock");

useFixedClock();

it("keeps tokens (and the API key) out of logs and URLs, while still emailing the link", async () => {
  const written = [];
  const capture = (...args) => written.push(args.map(String).join(" "));
  for (const m of ["log", "info", "warn", "error", "debug"]) jest.spyOn(console, m).mockImplementation(capture);
  const outSpy = jest.spyOn(process.stdout, "write").mockImplementation((c) => (written.push(String(c)), true));
  const errSpy = jest.spyOn(process.stderr, "write").mockImplementation((c) => (written.push(String(c)), true));

  const sent = [];
  global.fetch = jest.fn(async (url, init) => {
    sent.push(JSON.parse(init.body));
    return { ok: true, status: 201 };
  });

  const urls = [];
  const via = (method, path, body, ip) => {
    urls.push(path);
    return request(app)[method](path).set("X-Forwarded-For", ip).send(body);
  };

  pool.query
    .mockResolvedValueOnce({ rows: [{ id: 1, name: "Ama Boateng", title: "PM", allowed_durations: [30] }] })
    .mockResolvedValueOnce({ rows: [{ id: 5, start_time: isoAt(1, 9), end_time: isoAt(1, 9, 30), duration_minutes: 30, created_at: isoAt(0, 9) }] });
  const booked = await via("post", "/api/bookings", { mentor_id: 1, start_time: isoAt(1, 9), duration: 30, name: "Kwesi Mensah", email: "kwesi@example.com" }, "203.0.113.5");
  expect(booked.status).toBe(201);
  expect(booked.body.emailed).toBe(true);
  const token = booked.body.manage_token;

  pool.query.mockResolvedValueOnce({ rows: [{ id: 5, mentee_name: "K M", mentee_email: "k@x.com", start_time: isoAt(1, 9), end_time: isoAt(1, 9, 30), duration_minutes: 30, mentor_name: "A", mentor_title: "B", mentor_color: "#000", status: "upcoming" }] });
  expect((await via("post", "/api/manage/view", { token }, "203.0.113.6")).status).toBe(200);
  pool.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
  expect((await via("post", "/api/manage/cancel", { token }, "203.0.113.6")).status).toBe(200);
  pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
  expect((await via("post", "/api/manage/cancel", { token }, "203.0.113.6")).status).toBe(404);
  // A token that is wrong in every way, to exercise the error paths too.
  expect((await via("post", "/api/manage/view", { token: token + "x" }, "203.0.113.6")).status).toBe(404);

  pool.query.mockResolvedValueOnce({ rows: [{ id: 5, start_time: isoAt(1, 9), end_time: isoAt(1, 9, 30), duration_minutes: 30, mentor_name: "Ama", mentor_title: "PM" }] });
  await via("post", "/api/bookings/lookup", { email: "kwesi@example.com" }, "203.0.113.7");
  await whenIdle();

  jest.restoreAllMocks();
  delete global.fetch;

  // The emails did carry the link (that is their job)...
  expect(sent).toHaveLength(2);
  expect(sent[0].textContent).toContain(`https://app.example.test/manage#${token}`);
  // ...but nothing else did: not logs, not request URLs.
  const mac = token.split(".")[1];
  const log = written.join("\n");
  expect(log).not.toContain(token);
  expect(log).not.toContain(mac);
  expect(log).not.toContain("SECRET-KEY");
  expect(urls.join("\n")).not.toContain(mac);
});
