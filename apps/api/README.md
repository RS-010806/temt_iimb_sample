# TEMT API

Node 22, Express 5. It uses the same `@temt/calculator` engine as the browser, so any number can be recalculated on the server and compared. Build the calculator workspace first (`npm run build:api` from the repository root does both).

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Status, engine version and account storage (`postgres`, `embedded-local` or `embedded-ephemeral`, and whether it persists) |
| `GET /api/v2/factors` | The factor library: factor sets (`temt`, the default, and `glec-india` for comparison), road, rail, air, sea, waterway and hub values, fuels and sources |
| `POST /api/v2/calculate` | `{ factorSet?, shipments: [...] }`, up to 1,000 shipments; returns per-shipment results and totals |
| `/api/auth/*` | Sign up, sign in, sign out and the current session |
| `/api/account/*` | Profile, password, sessions, activity, data export and account deletion |
| `/api/workspace` | The synced workspace: gzip upload with optimistic versioning (409 on conflict), download and a server-side summary |
| `/api/reports` | Report history |
| `GET /api/factors`, `POST /api/analyze` | The earlier v1 engine, kept for existing integrations |

Errors use `{ error: { code, message } }` and never include stack traces or input data.

## Security

Passwords are hashed with scrypt; sessions are random 256-bit tokens in `HttpOnly`, `SameSite=Lax` cookies (`__Host-` prefixed in production) and only their SHA-256 is stored. State-changing requests need the `X-TEMT-Client` header and an allowed origin. Every SQL statement uses bound parameters. Sign-in is rate limited and locks after 8 failures per email in 15 minutes. `/api` allows 600 requests per minute per IP.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | none | Postgres connection string. For Supabase use the **Session pooler** URI. Tables are created on start in a `temt` schema with row-level security. |
| `DATABASE_CA_CERT` | none | Optional PEM certificate authority; when set, the database certificate is verified. Otherwise connections are encrypted without verification, as libpq's `sslmode=require`. |
| `TEMT_DATA_DIR` | none | Without `DATABASE_URL`, keep accounts in a SQLite file in this folder; without either, accounts live in memory. |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated exact origins allowed to call the API from a browser. The site's own origin is always allowed. |
| `TRUST_PROXY_HOPS` | `0` | Number of trusted reverse proxies (1 on Render). |
| `PORT` | `3001` | Listening port. |

See [docs/deployment.md](../../docs/deployment.md) for connecting Supabase on Render.
