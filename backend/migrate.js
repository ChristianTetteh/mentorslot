require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./db");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const LOCK_KEY = 727401; // arbitrary app-wide advisory lock id: serialises concurrent boots

function listMigrations(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
}

// Applies each numbered file in migrations/ once, in order, each inside its
// own transaction, recording it in schema_migrations. Migrations must be
// non-destructive: a database that already has the schema is never wiped.
async function migrate(db = pool, dir = MIGRATIONS_DIR) {
  const client = await db.connect();
  const applied = [];
  try {
    for (const file of [null, ...listMigrations(dir)]) {
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
        if (file === null) {
          await client.query(
            `CREATE TABLE IF NOT EXISTS schema_migrations (
               name TEXT PRIMARY KEY,
               applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
             )`
          );
        } else {
          const done = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
          if (done.rowCount === 0) {
            await client.query(fs.readFileSync(path.join(dir, file), "utf8"));
            await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
            applied.push(file);
          }
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        err.message = `${file || "schema_migrations setup"}: ${err.message}`;
        throw err;
      }
    }
  } finally {
    client.release();
  }
  return applied;
}

module.exports = { migrate, listMigrations };

if (require.main === module) {
  migrate()
    .then(async (applied) => {
      console.log(applied.length ? `✓ Applied migrations: ${applied.join(", ")}` : "✓ Database is up to date.");
      await pool.end();
    })
    .catch(async (err) => {
      console.error("Migration failed:", err);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
