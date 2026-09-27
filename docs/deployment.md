# Deployment

TEMT is one repository with three parts that build from the root: the shared calculator (`packages/calculator`), the static web app (`apps/web`) and the Express API (`apps/api`). The web app calls the API at `/api` on its own origin, so the account session cookie is always first-party. Nothing here needs a paid plan.

## Render

[`render.yaml`](../render.yaml) is a Render Blueprint with two free services:

| Service | Runtime | Build | Serves |
| --- | --- | --- | --- |
| `temt-iimb-sample` | Static site (global CDN) | `npm ci --include=dev && npm run build:web` | `apps/web/out`, with security headers and a Content-Security-Policy |
| `temt-iimb-api` | Node, Singapore, free plan | `npm ci --include=dev && npm run build:api` | `npm run start --workspace=@temt/api`, health check `/api/health` |

The static site rewrites `/api/*` to the API service, so the browser only ever talks to `https://temt-iimb-sample.onrender.com`. Both services deploy automatically when GitHub Actions passes on `main`.

### Keeping accounts permanently

Without a database the API keeps accounts in Node's built-in SQLite, in memory: accounts work, but they reset whenever the free API restarts or sleeps, and the Account page says so. To keep them:

1. Create a free Postgres database, for example at [neon.tech](https://neon.tech) (no card needed), and copy its connection string.
2. In Render, open **temt-iimb-api → Environment**, set `DATABASE_URL` to that string and save. Render redeploys the API.
3. `https://temt-iimb-sample.onrender.com/api/health` should then report `"accounts": { "storage": "postgres", "persistent": true }`.

Other API settings are in the Blueprint: `ALLOWED_ORIGINS` (exact extra origins allowed to call the API cross-origin), `TRUST_PROXY_HOPS` and `NODE_ENV`. The free API sleeps after 15 minutes idle and takes about a minute to wake; the web app keeps working meanwhile because every calculation runs in the browser.

## Local development

```sh
npm ci
cp apps/web/.env.example apps/web/.env.local   # points the web app at http://localhost:3001
npm run dev
```

The API stores local accounts in a SQLite file under `apps/api/.data/accounts` (ignored by Git). To check the production build exactly as Render serves it, with the same headers and CSP:

```sh
npm run build
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

GitHub Actions checks source data, types, tests (engine, API, accounts and web) and both builds on every push; Render deploys only after it passes. Confirm a deployment by opening `/api/health` on the site and running the browser suite against the live URL.
