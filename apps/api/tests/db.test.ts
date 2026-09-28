import { describe, expect, it } from "vitest";
import { dbOptionsFromEnv, postgresConnection } from "../src/db.js";

describe("database configuration", () => {
  it("encrypts managed Postgres connections without failing on a private CA", () => {
    const supabase = postgresConnection("postgresql://postgres.abc:p%40ss@aws-0-ap-south-1.pooler.supabase.com:5432/postgres");
    expect(supabase.ssl).toEqual({ rejectUnauthorized: false });
    expect(supabase.connectionString).toContain("p%40ss@");
    expect(postgresConnection("postgres://u:p@db.example.com/app?sslmode=require")).toEqual({ connectionString: "postgres://u:p@db.example.com/app", ssl: { rejectUnauthorized: false } });
  });

  it("verifies certificates when asked, and skips TLS locally or when disabled", () => {
    expect(postgresConnection("postgres://u:p@db.example.com/app?sslmode=verify-full").ssl).toEqual({ rejectUnauthorized: true });
    expect(postgresConnection("postgres://u:p@db.example.com/app", "PEM").ssl).toEqual({ ca: "PEM", rejectUnauthorized: true });
    expect(postgresConnection("postgres://u:p@localhost:5432/app").ssl).toBe(false);
    expect(postgresConnection("postgres://u:p@db.example.com/app?sslmode=disable").ssl).toBe(false);
  });

  it("reads storage from the environment", () => {
    expect(dbOptionsFromEnv({ DATABASE_URL: " postgres://x " })).toEqual({ url: "postgres://x", ca: undefined });
    expect(dbOptionsFromEnv({ TEMT_DATA_DIR: "/data" })).toEqual({ dataDir: "/data" });
    expect(dbOptionsFromEnv({})).toEqual({ dataDir: undefined });
  });
});
