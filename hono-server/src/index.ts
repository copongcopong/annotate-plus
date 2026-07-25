import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// annotate.js — Hono sync backend
//
// Start:  npm start          (runs on :3099 by default)
//         PORT=3099 npm start
//
// Endpoints:
//   GET  /api/sync?domain=X&page=Y  →  { domain, page, comments: [...] }
//   POST /api/sync                  →  { action: "upsert"|"delete", comment?, annotateId? }
//
// Data is stored as JSON files under data/<domain>/<encoded-page>.json
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

interface Reply {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

interface Comment {
  id: string;
  page: string;
  url: string;
  type: string;
  author: string;
  text: string;
  color: string;
  anchor: unknown;
  geom: unknown;
  resolved: boolean;
  replies: Reply[];
  createdAt: string;
  updatedAt: string;
}

interface StoreFile {
  domain: string;
  page: string;
  comments: Comment[];
}

const app = new Hono();

app.use("/*", cors());

// ---- helpers ---------------------------------------------------------------

function safeName(s: string): string {
  return s.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 120) || "index";
}

function filePath(domain: string, page: string): string {
  const dir = join(DATA_DIR, safeName(domain));
  mkdirSync(dir, { recursive: true });
  return join(dir, safeName(page) + ".json");
}

function readStore(domain: string, page: string): StoreFile {
  const fp = filePath(domain, page);
  if (!existsSync(fp)) return { domain, page, comments: [] };
  try {
    return JSON.parse(readFileSync(fp, "utf-8"));
  } catch {
    return { domain, page, comments: [] };
  }
}

function writeStore(store: StoreFile): void {
  const fp = filePath(store.domain, store.page);
  writeFileSync(fp, JSON.stringify(store, null, 2), "utf-8");
}

// ---- routes ----------------------------------------------------------------

// GET /api/sync?domain=example.com&page=/about
app.get("/api/sync", (c) => {
  const domain = c.req.query("domain") || "";
  const page = c.req.query("page") || "";
  if (!domain && !page) {
    return c.json({ error: "domain and page query params required" }, 400);
  }
  const store = readStore(domain, page);
  return c.json({ domain: store.domain, page: store.page, comments: store.comments });
});

// POST /api/sync  { action: "upsert"|"delete", comment?: Comment, annotateId?: string }
app.post("/api/sync", async (c) => {
  let body: { action: string; comment?: Comment; annotateId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const { action, comment, annotateId } = body;

  if (action === "delete") {
    const id = annotateId || (comment && comment.id);
    if (!id) return c.json({ ok: false, error: "Missing annotateId" }, 400);

    // Scan all domain directories and remove the ID from every store file.
    const globalDir = DATA_DIR;
    if (existsSync(globalDir)) {
      try {
        const domainDirs = readdirSync(globalDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
        for (const domain of domainDirs) {
          const domainPath = join(globalDir, domain);
          const files = readdirSync(domainPath, { withFileTypes: true })
            .filter((f) => f.isFile() && f.name.endsWith(".json"))
            .map((f) => f.name);
          for (const file of files) {
            const fp = join(domainPath, file);
            try {
              const store: StoreFile = JSON.parse(readFileSync(fp, "utf-8"));
              const before = store.comments.length;
              store.comments = store.comments.filter((c) => c.id !== id);
              let repliesChanged = false;
              for (const c of store.comments) {
                const rlen = (c.replies || []).length;
                c.replies = (c.replies || []).filter((r: Reply) => r.id !== id);
                if (c.replies.length !== rlen) repliesChanged = true;
              }
              if (store.comments.length !== before || repliesChanged) {
                writeStore(store);
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* scan failed */ }
    }
    return c.json({ ok: true });
  }

  if (action === "upsert") {
    if (!comment || !comment.id) {
      return c.json({ ok: false, error: "Missing comment with id" }, 400);
    }
    const domain = (comment.url && safeName(tryDomain(comment.url))) || "unknown";
    const page = comment.page || "/";
    const store = readStore(domain, page);

    const idx = store.comments.findIndex((c) => c.id === comment.id);
    if (idx >= 0) {
      // Update — server record wins if incoming is newer
      if (comment.updatedAt >= (store.comments[idx].updatedAt || "")) {
        store.comments[idx] = {
          ...store.comments[idx],
          ...comment,
          replies: comment.replies || store.comments[idx].replies,
        };
      }
    } else {
      store.comments.push(comment);
    }

    writeStore(store);
    return c.json({ ok: true });
  }

  return c.json({ ok: false, error: `Unknown action: ${action}` }, 400);
});

// ---- start -----------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "3099", 10);

console.log(`annotate-hono-sync starting on http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });

// ---- util ------------------------------------------------------------------

function tryDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
