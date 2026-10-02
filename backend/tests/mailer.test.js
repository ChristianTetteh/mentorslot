const { sendMail, isConfigured, BREVO_URL } = require("../lib/mailer");

const ENV = { NODE_ENV: "test", BREVO_API_KEY: "xkeysib-SECRET-KEY-123", MAIL_FROM: "bookings@example.com", MAIL_FROM_NAME: "MentorSlot Team" };
const MESSAGE = { to: "kwesi@example.com", subject: "Hello", text: "Plain body https://app/manage#5.tok", html: "<p>Html</p>" };

let logSpy, warnSpy, errorSpy;
beforeEach(() => {
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const allLogged = () => JSON.stringify([logSpy.mock.calls, warnSpy.mock.calls, errorSpy.mock.calls]);

describe("isConfigured", () => {
  it("needs both an API key and a sender", () => {
    expect(isConfigured({})).toBe(false);
    expect(isConfigured({ BREVO_API_KEY: "k" })).toBe(false);
    expect(isConfigured({ BREVO_API_KEY: "  ", MAIL_FROM: "a@b.com" })).toBe(false);
    expect(isConfigured({ BREVO_API_KEY: "k", MAIL_FROM: "a@b.com" })).toBe(true);
  });
});

describe("sendMail with a provider", () => {
  it("POSTs the documented Brevo JSON with the api-key header", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    const result = await sendMail(MESSAGE, { env: ENV, fetchImpl });
    expect(result).toEqual({ sent: true });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(url).toBe(BREVO_URL);
    expect(init.method).toBe("POST");
    expect(init.headers["api-key"]).toBe("xkeysib-SECRET-KEY-123");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: "MentorSlot Team", email: "bookings@example.com" },
      to: [{ email: "kwesi@example.com" }],
      subject: "Hello",
      textContent: MESSAGE.text,
      htmlContent: "<p>Html</p>",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits htmlContent when there is no html and defaults the sender name", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    await sendMail({ to: "a@b.com", subject: "s", text: "t" }, { env: { ...ENV, MAIL_FROM_NAME: "" }, fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.htmlContent).toBeUndefined();
    expect(body.sender.name).toBe("MentorSlot");
  });

  it("uses a 10 second timeout", async () => {
    const spy = jest.spyOn(AbortSignal, "timeout");
    await sendMail(MESSAGE, { env: ENV, fetchImpl: jest.fn().mockResolvedValue({ ok: true, status: 201 }) });
    expect(spy).toHaveBeenCalledWith(10000);
  });

  it("resolves { sent: false } (never throws) on a network error, and never logs the key or message", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(Object.assign(new Error("fetch failed"), { name: "TypeError" }));
    await expect(sendMail(MESSAGE, { env: ENV, fetchImpl })).resolves.toEqual({ sent: false });
    expect(errorSpy).toHaveBeenCalled();
    expect(allLogged()).not.toContain("SECRET-KEY");
    expect(allLogged()).not.toContain("manage#");
    expect(allLogged()).not.toContain("kwesi@example.com");
  });

  it("resolves { sent: false } on a timeout", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    await expect(sendMail(MESSAGE, { env: ENV, fetchImpl: jest.fn().mockRejectedValue(timeout) })).resolves.toEqual({ sent: false });
    expect(allLogged()).toContain("TimeoutError");
  });

  it("resolves { sent: false } on a provider error, logging the status and code but not the key or body", async () => {
    const res = { ok: false, status: 401, json: async () => ({ code: "unauthorized", message: "Key xkeysib-SECRET-KEY-123 not found" }) };
    await expect(sendMail(MESSAGE, { env: ENV, fetchImpl: jest.fn().mockResolvedValue(res) })).resolves.toEqual({ sent: false });
    expect(allLogged()).toContain("401");
    expect(allLogged()).toContain("unauthorized");
    expect(allLogged()).not.toContain("SECRET-KEY");
  });

  it("copes with an unparseable error body", async () => {
    const res = { ok: false, status: 502, json: async () => { throw new Error("not json"); } };
    await expect(sendMail(MESSAGE, { env: ENV, fetchImpl: jest.fn().mockResolvedValue(res) })).resolves.toEqual({ sent: false });
  });
});

describe("sendMail without a provider", () => {
  it("outside production, logs the message (with its link) to the console and does not call out", async () => {
    const fetchImpl = jest.fn();
    const result = await sendMail(MESSAGE, { env: { NODE_ENV: "development" }, fetchImpl });
    expect(result).toEqual({ sent: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.join("\n")).toContain("https://app/manage#5.tok");
  });

  it("in production, warns (without the message, link or recipient) and resolves without sending", async () => {
    const fetchImpl = jest.fn();
    const result = await sendMail(MESSAGE, { env: { NODE_ENV: "production" }, fetchImpl });
    expect(result).toEqual({ sent: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(allLogged()).not.toContain("manage#");
    expect(allLogged()).not.toContain("kwesi@example.com");
  });

  it("treats a key without a sender as unconfigured", async () => {
    const fetchImpl = jest.fn();
    expect(await sendMail(MESSAGE, { env: { NODE_ENV: "production", BREVO_API_KEY: "k" }, fetchImpl })).toEqual({ sent: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
