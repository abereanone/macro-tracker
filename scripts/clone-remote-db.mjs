import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dbName = process.env.D1_DATABASE_NAME || "macro_tracker";
const wrangler = join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "wrangler.cmd" : "wrangler",
);
const tmpDir = join(repoRoot, ".wrangler", "tmp", "db-clone");
const dataDump = join(tmpDir, `${dbName}-remote-data.sql`);
const truncateSql = join(tmpDir, `${dbName}-truncate-local.sql`);
const countSql = join(tmpDir, `${dbName}-counts.sql`);
const migrationLedgerSql = join(tmpDir, `${dbName}-local-migrations.sql`);
const migrationQuerySql = join(tmpDir, `${dbName}-local-migration-names.sql`);

const tablesInDeleteOrder = [
  "help_dismissals",
  "friend_access",
  "friend_invites",
  "daily_goal_completions",
  "daily_goal_definitions",
  "user_maintenance_snapshots",
  "auth_sessions",
  "auth_login_codes",
  "saved_meal_items",
  "diary_items",
  "weight_entries",
  "goal_plans",
  "saved_meals",
  "foods",
  "users",
  "d1_migrations",
];

const tablesInCountOrder = [
  "users",
  "auth_login_codes",
  "auth_sessions",
  "foods",
  "diary_items",
  "saved_meals",
  "saved_meal_items",
  "weight_entries",
  "goal_plans",
  "user_maintenance_snapshots",
  "daily_goal_definitions",
  "daily_goal_completions",
  "friend_invites",
  "friend_access",
  "help_dismissals",
  "d1_migrations",
];

function run(args, options = {}) {
  const result = spawnSync(wrangler, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    if (options.capture) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    process.exit(result.status ?? 1);
  }

  return result;
}

mkdirSync(tmpDir, { recursive: true });

writeFileSync(
  truncateSql,
  [
    "PRAGMA defer_foreign_keys=TRUE;",
    ...tablesInDeleteOrder.map((table) => `DELETE FROM "${table}";`),
    `DELETE FROM sqlite_sequence WHERE name IN (${tablesInDeleteOrder.map((table) => `'${table}'`).join(", ")});`,
    "",
  ].join("\n"),
);

writeFileSync(
  countSql,
  [
    ...tablesInCountOrder.map((table) => `SELECT '${table}' AS table_name, COUNT(*) AS row_count FROM "${table}";`),
    "",
  ].join("\n"),
);

// The clone replaces d1_migrations with the remote ledger, but a data-only load
// cannot remove columns that local migrations already added. When local is ahead
// of remote, re-record those migrations afterwards so the next `db:migrate` does
// not try to apply them a second time and fail on a duplicate column.
function localOnlyMigrations() {
  // Queries go through a file: run() shells out on Windows, which would split an
  // unquoted --command on its spaces.
  writeFileSync(migrationQuerySql, "SELECT name FROM d1_migrations ORDER BY id;\n");
  const result = run(["d1", "execute", dbName, "--local", "--file", migrationQuerySql, "--json"], { capture: true });
  const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("[")));
  return (parsed[0]?.results ?? []).map((row) => row.name);
}

console.log(`Exporting remote ${dbName} data...`);
run([
  "d1",
  "export",
  dbName,
  "--remote",
  "--no-schema",
  "--output",
  dataDump,
  "--skip-confirmation",
]);

const localMigrations = localOnlyMigrations();

console.log(`Clearing local ${dbName} tables...`);
run(["d1", "execute", dbName, "--local", "--file", truncateSql]);

console.log(`Loading remote data into local ${dbName}...`);
run(["d1", "execute", dbName, "--local", "--file", dataDump]);

if (localMigrations.length) {
  writeFileSync(
    migrationLedgerSql,
    [
      ...localMigrations.map((name) => `INSERT OR IGNORE INTO d1_migrations (name) VALUES ('${name.replace(/'/g, "''")}');`),
      "",
    ].join("\n"),
  );
  console.log("Restoring locally applied migrations...");
  run(["d1", "execute", dbName, "--local", "--file", migrationLedgerSql]);
}

console.log("Local row counts after clone:");
run(["d1", "execute", dbName, "--local", "--file", countSql]);
