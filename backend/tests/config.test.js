const { assertProductionConfig, getFrontendOrigin, isProduction } = require("../lib/config");

const prod = (over = {}) => ({ NODE_ENV: "production", MANAGE_SECRET: "m".repeat(40), ...over });

describe("assertProductionConfig (refuse to boot)", () => {
  it("does nothing outside production", () => {
    expect(() => assertProductionConfig({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertProductionConfig({})).not.toThrow();
  });

  it("requires MANAGE_SECRET of 32+ characters in production", () => {
    expect(() => assertProductionConfig({ NODE_ENV: "production" })).toThrow(/MANAGE_SECRET/);
    expect(() => assertProductionConfig(prod({ MANAGE_SECRET: "short" }))).toThrow(/MANAGE_SECRET/);
    expect(() => assertProductionConfig(prod())).not.toThrow();
  });

  it("requires a usable origin for links once email is on", () => {
    expect(() => assertProductionConfig(prod({ BREVO_API_KEY: "k" }))).toThrow(/FRONTEND_ORIGIN/);
    expect(() => assertProductionConfig(prod({ BREVO_API_KEY: "k", CORS_ORIGIN: "*" }))).toThrow(/FRONTEND_ORIGIN/);
    expect(() => assertProductionConfig(prod({ BREVO_API_KEY: "k", FRONTEND_ORIGIN: "https://app.example.com" }))).not.toThrow();
    expect(() => assertProductionConfig(prod({ BREVO_API_KEY: "k", CORS_ORIGIN: "https://app.example.com" }))).not.toThrow();
  });

  it("rejects a FRONTEND_ORIGIN that isn't a bare origin", () => {
    for (const bad of ["app.example.com", "https://app.example.com/some/path", "javascript:alert(1)", "https://u:p@app.example.com"]) {
      expect(() => assertProductionConfig(prod({ FRONTEND_ORIGIN: bad }))).toThrow(/FRONTEND_ORIGIN/);
    }
  });
});

describe("getFrontendOrigin", () => {
  it("prefers FRONTEND_ORIGIN and strips trailing slashes", () => {
    expect(getFrontendOrigin({ FRONTEND_ORIGIN: "https://app.example.com//", CORS_ORIGIN: "https://other.example" })).toBe("https://app.example.com");
  });

  it("falls back to the first value of CORS_ORIGIN", () => {
    expect(getFrontendOrigin({ CORS_ORIGIN: "https://a.example.com, https://b.example.com" })).toBe("https://a.example.com");
  });

  it("uses the local Vite origin outside production, and nothing in production", () => {
    expect(getFrontendOrigin({ NODE_ENV: "development" })).toBe("http://localhost:5173");
    expect(getFrontendOrigin({ NODE_ENV: "production" })).toBeNull();
    expect(getFrontendOrigin({ NODE_ENV: "production", CORS_ORIGIN: "*" })).toBeNull();
  });

  it("ignores garbage and non-http schemes", () => {
    expect(getFrontendOrigin({ NODE_ENV: "production", FRONTEND_ORIGIN: "javascript:alert(1)" })).toBeNull();
    expect(getFrontendOrigin({ NODE_ENV: "production", FRONTEND_ORIGIN: "https://evil.example/path#x" })).toBeNull();
  });
});

describe("isProduction", () => {
  it("fails closed on mis-cased NODE_ENV and on Render", () => {
    expect(isProduction({ NODE_ENV: "PRODUCTION" })).toBe(true);
    expect(isProduction({ RENDER: "true" })).toBe(true);
    expect(isProduction({ NODE_ENV: "test" })).toBe(false);
  });
});
