# Deployment

TEMT is one repository with three parts that build from the root: the shared calculator (`packages/calculator`), the static web app (`apps/web`) and the Express API (`apps/api`). The web app calls the API at `/api` on its own origin, so the account session cookie is always first-party.

Nothing here needs a paid plan.

## Vercel (primary)

[`vercel.json`](../vercel.json) deploys the static export from `apps/web/out` and the API as one serverless function ([`api/index.mjs`](../api/index.mjs)) behind `/api/*`, with security headers and a Content-Security-Policy on every page.

1. Import `RS-010806/temt_iimb_sample` in Vercel (or run `npx vercel` in the repository). Keep the root directory as the repository root; framework preset "Other". The build and output settings come from `vercel.json`.
2. Add a free Postgres database so accounts persist: in the Vercel project open **Storage → Create → Neon (Postgres)** and connect it to the project. This sets `DATABASE_URL`. Any Postgres connection string works.
3. Redeploy. `GET /api/health` should report `"accounts": { "storage": "postgres", "persistent": true }`.

Without `DATABASE_URL` the API falls back to an in-memory embedded Postgres (PGlite). Everything works, but accounts reset whenever the function restarts, and the Account page says so.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string for accounts, synced workspaces and report history |
| `NEXT_PUBLIC_SITE_URL` | Public URL for metadata and the sitemap; defaults to Vercel's production URL |
| `ALLOWED_ORIGINS` | Extra exact origins allowed to call the API cross-origin (same-origin calls need no setting) |

## Render (secondary)

[`render.yaml`](../render.yaml) defines a static site and a Node API. The static site rewrites `/api/*` to the API service, so the browser still talks to one origin. Set `DATABASE_URL` on the API service (it is declared with `sync: false`) to keep accounts; the same Neon database can serve both deployments. Render's free API sleeps after 15 minutes idle and takes about a minute to wake.

## Local development

```sh
npm ci
cp apps/web/.env.example apps/web/.env.local   # points the web app at http://localhost:3001
npm run dev
```

The API stores local accounts in `apps/api/.data/accounts` (ignored by Git). To check the production build exactly as Vercel serves it, including headers and CSP:

```sh
npm run build:api && NEXT_PUBLIC_API_BASE_URL= npm run build -w @temt/web
node scripts/preview-server.mjs
```

Then run the browser suite from `video/`: `BASE=http://localhost:3000 npx tsx scripts/e2e.ts`.

## Security model

- Passwords: scrypt with a per-user salt; cost parameters are stored with each hash.
- Sessions: 256-bit random tokens in `HttpOnly`, `SameSite=Lax` cookies (`__Host-` prefixed and `Secure` in production); only a SHA-256 of the token is stored. Sessions expire after 30 days and can be revoked from the Account page.
- Cross-site requests: state-changing calls must carry the `X-TEMT-Client` header and come from the site's own origin or an allow-listed one.
- SQL: every query uses bound parameters; the test suite sends injection payloads through each input.
- Abuse: per-IP rate limits, plus a database-backed lockout after repeated failed sign-ins for an email.
- Uploads: workspace sync accepts gzip up to 4 MB and rejects anything that expands beyond 40 MB.

## Verification

GitHub Actions checks source data, types, tests (engine, API, accounts and web) and both builds on every push. Deployments should be confirmed by opening `/api/health` and running the browser suite against the live URL.
