/**
 * Storage for accounts and synced workspaces.
 *
 * Every statement goes through `query(text, params)` with numbered placeholders, so user input is always
 * sent as a bound parameter and never concatenated into SQL.
 *
 * - DATABASE_URL set: hosted Postgres (for example a free Neon database) through node-postgres.
 * - Otherwise: PGlite, the same Postgres engine compiled to WebAssembly, in memory or in a local folder.
 */
export type StorageMode = "postgres" | "embedded-local" | "embedded-ephemeral";

export interface Db {
  mode: StorageMode;
  /** True when data survives restarts and redeploys. */
  persistent: boolean;
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export interface DbOptions {
  url?: string;
  /** Folder for the embedded database. Omit for an in-memory database. */
  dataDir?: string;
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS temt_users (
    id uuid PRIMARY KEY,
    email text NOT NULL,
    email_key text NOT NULL UNIQUE,
    name text NOT NULL,
    organisation text NOT NULL DEFAULT '',
    job_title text NOT NULL DEFAULT '',
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS temt_sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES temt_users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    user_agent text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS temt_sessions_user_idx ON temt_sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS temt_workspaces (
    user_id uuid PRIMARY KEY REFERENCES temt_users(id) ON DELETE CASCADE,
    version integer NOT NULL,
    data jsonb NOT NULL,
    shipments integer NOT NULL,
    bytes integer NOT NULL,
    device text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS temt_reports (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES temt_users(id) ON DELETE CASCADE,
    title text NOT NULL,
    period text NOT NULL,
    format text NOT NULL,
    shipments integer NOT NULL,
    wtw_kg double precision NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS temt_reports_user_idx ON temt_reports (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS temt_activity (
    id bigserial PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES temt_users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    detail text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS temt_activity_user_idx ON temt_activity (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS temt_login_failures (
    key text NOT NULL,
    at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS temt_login_failures_idx ON temt_login_failures (key, at)`,
];

async function migrate(db: Db) {
  for (const statement of MIGRATIONS) await db.query(statement);
}

async function postgres(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  // Serverless functions run many small instances, so each keeps a very small pool.
  const pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
  return {
    mode: "postgres",
    persistent: true,
    async query<T>(text: string, params: readonly unknown[] = []) { return (await pool.query(text, params as unknown[])).rows as T[]; },
    close: () => pool.end(),
  };
}

async function embedded(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const lite = dataDir ? new PGlite(dataDir) : new PGlite();
  await lite.waitReady;
  return {
    mode: dataDir ? "embedded-local" : "embedded-ephemeral",
    persistent: !!dataDir,
    async query<T>(text: string, params: readonly unknown[] = []) { return (await lite.query<T>(text, params as unknown[])).rows; },
    close: () => lite.close(),
  };
}

export async function openDb(options: DbOptions = {}): Promise<Db> {
  const db = options.url ? await postgres(options.url) : await embedded(options.dataDir);
  await migrate(db);
  return db;
}

/** Storage from the environment: DATABASE_URL, else TEMT_DATA_DIR, else in memory. */
export function dbOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): DbOptions {
  const url = env.DATABASE_URL?.trim() || env.POSTGRES_URL?.trim();
  if (url) return { url };
  return { dataDir: env.TEMT_DATA_DIR?.trim() || undefined };
}
