import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { StoreFile, Comment, Reply } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, "..", "..", "data");

export function safeName(s: string): string {
  return s.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 120) || "index";
}

export function filePath(domain: string, page: string): string {
  const dir = join(DATA_DIR, safeName(domain));
  mkdirSync(dir, { recursive: true });
  return join(dir, safeName(page) + ".json");
}

export function readStore(domain: string, page: string): StoreFile {
  const fp = filePath(domain, page);
  if (!existsSync(fp)) return { domain, page, comments: [] };
  try {
    return JSON.parse(readFileSync(fp, "utf-8"));
  } catch {
    return { domain, page, comments: [] };
  }
}

export function writeStore(store: StoreFile): void {
  const fp = filePath(store.domain, store.page);
  writeFileSync(fp, JSON.stringify(store, null, 2), "utf-8");
}

export function deleteFromAllStores(id: string): void {
  if (!existsSync(DATA_DIR)) return;
  try {
    const domainDirs = readdirSync(DATA_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const domain of domainDirs) {
      const domainPath = join(DATA_DIR, domain);
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

export function tryDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}
