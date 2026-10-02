// Offline guard rails for the migration files themselves; the real-database
// behaviour is covered in concurrency.test.js.
const fs = require("fs");
const path = require("path");
const { listMigrations } = require("../migrate");

const dir = path.join(__dirname, "..", "migrations");

describe("migration files", () => {
  const files = listMigrations();

  it("are numbered consecutively from 001", () => {
    expect(files.map((f) => Number(f.slice(0, 3)))).toEqual(files.map((_, i) => i + 1));
  });

  it("never drop or empty tables/columns (they run against the live database)", () => {
    for (const f of files) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8").replace(/--.*$/gm, "");
      expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)\b/i);
      expect(sql).not.toMatch(/\bTRUNCATE\b/i);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    }
  });

  it("makes migration 001 create-if-not-exists style so it is a no-op on the existing database", () => {
    const sql = fs.readFileSync(path.join(dir, files[0]), "utf8").replace(/--.*$/gm, "");
    const creates = sql.match(/CREATE (TABLE|INDEX|UNIQUE INDEX|EXTENSION)\b[^;]*/gi);
    for (const c of creates) expect(c).toMatch(/IF NOT EXISTS/i);
  });
});
