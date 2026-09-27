// Vercel serverless entry: the same Express app as the standalone API, served from /api on the site's own origin.
import { createApp } from "../apps/api/dist/app.js";

export default createApp({ trustProxyHops: 1 });
