# TEMT stateless analysis API

Node 22, Express 5. Build the `@temt/calculator` workspace before this package.

| Endpoint | Response |
| --- | --- |
| `GET /health` or `/api/health` | `{status: "ok", engineVersion, persistence: "none"}` |
| `GET /api/factors` | `{engineVersion, maxLegs, factors, methodology}` |
| `POST /api/analyze` | Send `{rows: [...]}` as JSON; receive the shared `AnalysisResult` directly. |

Malformed envelopes/JSON return 400. Unsupported media types return 415. Batches above 1,000 rows or bodies above 2 MiB return 413. Valid envelopes with row errors return 200, with excluded rows explained in `errors`. Error responses use `{error: {code, message}}`; internal errors do not include stack traces or input data. Requests are processed in memory, without shipment persistence or body logging. Responses use `Cache-Control: no-store`.

`ALLOWED_ORIGINS` is a comma-separated list of exact HTTP(S) origins, for example `http://localhost:3000,https://temt.example.com`. Do not include trailing slashes, paths or wildcards. Missing configuration permits only `http://localhost:3000`; an empty value permits no browser origins. Disallowed browser origins receive 403. Origin-less requests are allowed for server integrations; CORS is not authentication.

`PORT` defaults to 3001. `TRUST_PROXY_HOPS` defaults to 0; set it to the verified number of controlled reverse proxies (normally 1 for a directly deployed Render service). The service limits `/api` traffic to 60 requests per minute per IP, excluding health checks, and returns 429 when exceeded. This limiter is process-local and is not a distributed quota. The frontend should retain its local fallback and expose which calculation path was used.
