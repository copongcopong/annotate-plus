import { serve } from "@hono/node-server";
import app from "./app.js";

const PORT = parseInt(process.env.PORT || "3099", 10);
console.log(`annotate-hono-sync starting on http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });
