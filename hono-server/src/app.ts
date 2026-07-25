import { Hono } from "hono";
import { cors } from "hono/cors";
import syncRoutes from "./routes/sync.js";

const app = new Hono();

app.use("/*", cors());
app.route("/api/sync", syncRoutes);

export default app;
