import { Hono } from "hono";
import type { SyncRequest } from "../lib/types.js";
import { readStore, writeStore, deleteFromAllStores, tryDomain, safeName } from "../lib/store.js";

const sync = new Hono();

// GET /api/sync?domain=example.com&page=/about
sync.get("/", (c) => {
  const domain = c.req.query("domain") || "";
  const page = c.req.query("page") || "";
  if (!domain && !page) {
    return c.json({ error: "domain and page query params required" }, 400);
  }
  const store = readStore(domain, page);
  return c.json({ domain: store.domain, page: store.page, comments: store.comments });
});

// POST /api/sync  { action: "upsert"|"delete", comment?, annotateId? }
sync.post("/", async (c) => {
  let body: SyncRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const { action, comment, annotateId } = body;

  if (action === "delete") {
    const id = annotateId || (comment && comment.id);
    if (!id) return c.json({ ok: false, error: "Missing annotateId" }, 400);
    deleteFromAllStores(id);
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

export default sync;
