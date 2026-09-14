# Render deployment

The repository defines a static Next.js frontend and a stateless Node API. The frontend and local estimator remain available when the free API is starting. Both services use the same calculator package and build from the repository root.

## Service configuration

| Setting | Frontend | API |
| --- | --- | --- |
| Blueprint name | `temt-iimb-sample` | `temt-iimb-api` |
| Runtime | `static` | `node` |
| Plan | Render static site | `free` |
| Region | Global CDN | Singapore |
| Build | `npm ci --include=dev && npm run build:web` | `npm ci --include=dev && npm run build:api` |
| Output/start | Publish `apps/web/out` | `npm run start --workspace=@temt/api` |
| Health path | Homepage | `/api/health` |
| Deployment trigger | GitHub checks pass | GitHub checks pass |

Node is pinned to `22.23.2`. Dependencies are installed from the root lockfile. Do not set a service root directory to an application subfolder: Render would exclude the shared calculator package from that service.

## Publish and connect

1. Sign in to Render and connect the GitHub repository `RS-010806/temt_iimb_sample` using the linked GitHub account.
2. Create a Blueprint from the repository's `render.yaml`. It provisions the two free services. Confirm that the API deployment reaches `/api/health` successfully.
3. Copy the API's actual HTTPS URL assigned by Render. Set the frontend environment variable `NEXT_PUBLIC_API_BASE_URL` to that URL, without a trailing slash. Set `NEXT_PUBLIC_SITE_URL` to the frontend URL for sharing and metadata.
4. Copy the frontend's actual HTTPS origin. Set API `ALLOWED_ORIGINS` to that origin. To include local development, append `,http://localhost:3000`.
5. Record those public values in `render.yaml` before the next Blueprint sync. A sync can restore the file's values over dashboard edits. These URLs are public configuration, not secrets.
6. Redeploy the API and rebuild the frontend. `NEXT_PUBLIC_*` values are embedded at build time, so an environment change requires a new frontend build.
7. Verify a real browser POST from the deployed frontend, server calculation, report download, refresh on demo routes, keyboard controls and mobile layout. Record the live URL and observed results.

The Blueprint now records the assigned URLs: `https://temt-iimb-sample.onrender.com` for the frontend and `https://temt-iimb-api.onrender.com` for the API. A fork or recreated service can receive different hostnames; update both the frontend's API URL and the API's allowed origin together. `TRUST_PROXY_HOPS=1` matches the directly deployed Render service.

## Behavior and limitations

- The API binds to `0.0.0.0` using Render's `PORT` value. It stores no uploaded shipment records or generated reports persistently.
- The browser calls the API over its public HTTPS URL with CORS. CORS permits reading responses from configured frontend origins; it is not authentication.
- Render's free API can sleep after 15 minutes without traffic and take roughly one minute to resume. The UI must explain starting/unavailable service states and preserve local estimate access. Do not claim server verification when the server has not responded.
- No uptime SLA or latency promise is established by this showcase. Record measured response timing only as an observation of the test run.
- The provided configuration has no paid compute, database, disk, email service or private product API credentials.
- An optional API upgrade to `plan: 0.5c-512mb` removes the free plan's idle sleep. The reviewed base compute price is $7/month; only change this with authorization for the paid service.
- The Apache 2.0 repository license is retained. Source data, fonts, photography and third-party code keep their own applicable terms.

## Build verification

The GitHub workflow checks source data, builds the shared calculator, checks types, runs tests, and builds the frontend and API. It uploads the generated frontend and API artifacts for 14 days. Actions use pinned dependency revisions and read-only repository permission.

Before marking the delivery complete, confirm the successful GitHub run and Render deployment. Merely adding this Blueprint and workflow does not establish a live deployment.

References: [Render monorepos](https://render.com/docs/monorepo-support), [Blueprints](https://render.com/docs/blueprint-spec), [free limits](https://render.com/docs/free), [pricing](https://render.com/pricing).
