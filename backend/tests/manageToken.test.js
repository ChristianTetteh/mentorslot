// Token = `${bookingId}.${base64url(HMAC-SHA256(MANAGE_SECRET, 'manage:' + id))}`.
const crypto = require("crypto");
const { createManageToken, verifyManageToken } = require("../lib/manageToken");
const { getManageSecret, DEV_MANAGE_SECRET } = require("../lib/config");

const SECRET = "s".repeat(40);
const env = (over = {}) => ({ NODE_ENV: "test", MANAGE_SECRET: SECRET, ...over });
const hmac = (secret, id) => crypto.createHmac("sha256", secret).update(`manage:${id}`).digest("base64url");

describe("manage tokens", () => {
  it("has the documented shape and is a plain HMAC of the booking id", () => {
    const token = createManageToken(42, env());
    expect(token).toBe(`42.${hmac(SECRET, 42)}`);
    expect(token).toMatch(/^42\.[A-Za-z0-9_-]{43}$/);
  });

  it("verifies a genuine token and returns the booking id", () => {
    expect(verifyManageToken(createManageToken(42, env()), env())).toBe(42);
    expect(verifyManageToken(createManageToken(2147483647, env()), env())).toBe(2147483647);
  });

  it("is deterministic (nothing stored) and differs per booking", () => {
    expect(createManageToken(7, env())).toBe(createManageToken(7, env()));
    expect(createManageToken(7, env())).not.toBe(createManageToken(8, env()).replace(/^8/, "7"));
  });

  it("rejects a tampered mac (every position of the mac, one char flipped)", () => {
    const token = createManageToken(5, env());
    const [id, mac] = token.split(".");
    for (let i = 0; i < mac.length; i++) {
      const flipped = mac.slice(0, i) + (mac[i] === "A" ? "B" : "A") + mac.slice(i + 1);
      expect(verifyManageToken(`${id}.${flipped}`, env())).toBeNull();
    }
  });

  it("rejects another booking's mac, and a swapped booking id", () => {
    const other = createManageToken(6, env()).split(".")[1];
    expect(verifyManageToken(`5.${other}`, env())).toBeNull();
    expect(verifyManageToken(`6.${createManageToken(5, env()).split(".")[1]}`, env())).toBeNull();
  });

  it("rejects a token made with a different secret", () => {
    const token = createManageToken(5, env({ MANAGE_SECRET: "x".repeat(40) }));
    expect(verifyManageToken(token, env())).toBeNull();
    // ...and the public dev secret can't be used to forge one against another secret
    expect(verifyManageToken(`5.${hmac(DEV_MANAGE_SECRET, 5)}`, env())).toBeNull();
  });

  it("rejects malformed input before doing any work", () => {
    const good = createManageToken(5, env());
    const mac = good.split(".")[1];
    const bad = [
      "", ".", "5", "5.", `.${mac}`, `5.${mac}x`, `5.${mac.slice(1)}`, `05.${mac}`, `0.${mac}`, `-5.${mac}`,
      `5.${mac}.${mac}`, `5 .${mac}`, ` ${good}`, `${good} `, `${good}\n`, `5.${mac.slice(0, 42)}=`, `5.${"+".repeat(43)}`,
      `99999999999.${mac}`, `2147483648.${mac}`, `1e3.${mac}`, `5.${mac}`.toUpperCase(), "A".repeat(5000),
      `5.${mac}\u0000`, `５.${mac}`, "__proto__", "constructor",
    ];
    for (const token of bad) expect(verifyManageToken(token, env())).toBeNull();
    for (const token of [undefined, null, 5, {}, [], [good], true, () => good, Symbol.iterator]) {
      expect(verifyManageToken(token, env())).toBeNull();
    }
  });

  it("compares the mac with crypto.timingSafeEqual", () => {
    const spy = jest.spyOn(crypto, "timingSafeEqual");
    verifyManageToken(createManageToken(5, env()), env());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].length).toBe(spy.mock.calls[0][1].length);
    spy.mockClear();
    verifyManageToken("5.short", env()); // malformed: never reaches the comparison
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("MANAGE_SECRET handling", () => {
  it("falls back to a fixed dev value outside production only", () => {
    expect(getManageSecret({ NODE_ENV: "development" })).toBe(DEV_MANAGE_SECRET);
    expect(getManageSecret({ NODE_ENV: "test" })).toBe(DEV_MANAGE_SECRET);
    expect(getManageSecret({})).toBe(DEV_MANAGE_SECRET);
  });

  it.each([
    [{ NODE_ENV: "production" }],
    [{ NODE_ENV: "production", MANAGE_SECRET: "" }],
    [{ NODE_ENV: "production", MANAGE_SECRET: "short" }],
    [{ NODE_ENV: "production", MANAGE_SECRET: "x".repeat(31) }],
    // fail closed on look-alikes of production
    [{ NODE_ENV: "Production" }],
    [{ NODE_ENV: " production " }],
    [{ NODE_ENV: "staging", RENDER: "true" }],
  ])("refuses to use the dev secret in production-like env %j", (e) => {
    expect(() => getManageSecret(e)).toThrow(/MANAGE_SECRET/);
    expect(() => createManageToken(1, e)).toThrow(/MANAGE_SECRET/);
  });

  it("accepts a 32+ character secret in production", () => {
    expect(getManageSecret({ NODE_ENV: "production", MANAGE_SECRET: "x".repeat(32) })).toBe("x".repeat(32));
  });

  it("verification in production without a secret throws instead of using the dev secret", () => {
    const forged = `5.${hmac(DEV_MANAGE_SECRET, 5)}`;
    expect(() => verifyManageToken(forged, { NODE_ENV: "production" })).toThrow(/MANAGE_SECRET/);
  });
});
