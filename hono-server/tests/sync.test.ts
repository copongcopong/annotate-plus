import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const PORT = 3097;

let server: ChildProcess | null = null;

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve(), 5000);
    server = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: "pipe",
    });
    server.stdout?.on("data", (data: Buffer) => {
      if (data.toString().includes("starting")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.on("error", reject);
    server.stderr?.on("data", () => {});
  });
}

function stopServer() {
  if (server) { server.kill(); server = null; }
}

function cleanData() {
  if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });
}

describe("Hono sync server", () => {
  beforeAll(async () => {
    cleanData();
    await startServer();
  }, 10000);

  afterAll(() => {
    stopServer();
    cleanData();
  });

  const BASE = `http://localhost:${PORT}`;

  it("GET /api/sync returns empty for unknown domain/page", async () => {
    const res = await fetch(`${BASE}/api/sync?domain=test.com&page=/about`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.comments).toEqual([]);
  });

  it("POST upsert creates and GET returns the comment with nested replies", async () => {
    const comment = {
      id: "c-1", page: "demo:/", url: "http://test.com/",
      type: "pin", author: "Alice", text: "Fix alignment",
      color: "#f59e0b", anchor: null,
      geom: { kind: "pin", x: 100, y: 200 }, resolved: false,
      replies: [{ id: "r1", author: "Bob", text: "+1", createdAt: "2025-01-01T00:00:00.000Z" }],
      createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
    };
    const upsert = await fetch(`${BASE}/api/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", comment }),
    });
    expect((await upsert.json()).ok).toBe(true);

    const get = await fetch(`${BASE}/api/sync?domain=test.com&page=demo:/`);
    const data = await get.json();
    expect(data.comments.length).toBe(1);
    expect(data.comments[0].text).toBe("Fix alignment");
    expect(data.comments[0].replies.length).toBe(1);
    expect(data.comments[0].replies[0].text).toBe("+1");
  });

  it("POST upsert updates when newer", async () => {
    const updated = {
      id: "c-1", page: "demo:/", url: "http://test.com/",
      type: "pin", author: "Alice", text: "Fixed!", color: "#f59e0b",
      anchor: null, geom: { kind: "pin", x: 100, y: 200 }, resolved: true,
      replies: [], createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-02T00:00:00.000Z",
    };
    await fetch(`${BASE}/api/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", comment: updated }),
    });
    const get = await fetch(`${BASE}/api/sync?domain=test.com&page=demo:/`);
    const data = await get.json();
    expect(data.comments[0].text).toBe("Fixed!");
    expect(data.comments[0].resolved).toBe(true);
  });

  it("POST upsert does NOT overwrite with older data", async () => {
    const older = {
      id: "c-1", page: "demo:/", url: "http://test.com/",
      type: "pin", author: "Alice", text: "STALE", color: "#f59e0b",
      anchor: null, geom: { kind: "pin", x: 100, y: 200 }, resolved: false,
      replies: [], createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    await fetch(`${BASE}/api/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", comment: older }),
    });
    const get = await fetch(`${BASE}/api/sync?domain=test.com&page=demo:/`);
    const data = await get.json();
    expect(data.comments[0].text).toBe("Fixed!"); // still newer
    expect(data.comments[0].resolved).toBe(true);
  });

  it("POST delete removes comment", async () => {
    await fetch(`${BASE}/api/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", annotateId: "c-1" }),
    });
    const get = await fetch(`${BASE}/api/sync?domain=test.com&page=demo:/`);
    const data = await get.json();
    expect(data.comments.length).toBe(0);
  });

  it("POST delete also removes reply IDs from nested replies", async () => {
    // Create comment with replies
    const comment = {
      id: "c-2", page: "demo:/", url: "http://test.com/",
      type: "highlight", author: "Carol", text: "Reword",
      color: "#8b5cf6", anchor: null, geom: null, resolved: false,
      replies: [
        { id: "rx", author: "Dave", text: "+1", createdAt: "2025-01-01T00:00:00.000Z" },
        { id: "ry", author: "Eve", text: "Agreed", createdAt: "2025-01-01T00:00:00.000Z" },
      ],
      createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
    };
    await fetch(`${BASE}/api/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", comment }),
    });

    // Delete one reply
    await fetch(`${BASE}/api/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", annotateId: "rx" }),
    });

    const get = await fetch(`${BASE}/api/sync?domain=test.com&page=demo:/`);
    const data = await get.json();
    expect(data.comments[0].replies.length).toBe(1);
    expect(data.comments[0].replies[0].id).toBe("ry");
  });

  it("returns 400 for missing domain/page", async () => {
    const res = await fetch(`${BASE}/api/sync`);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown action", async () => {
    const res = await fetch(`${BASE}/api/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unknown" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for upsert without comment", async () => {
    const res = await fetch(`${BASE}/api/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert" }),
    });
    expect(res.status).toBe(400);
  });
});
