import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { spawn } from "node:child_process";
import { createServer } from "../src/server";
async function withServer(fn: (url: string) => Promise<void>) {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as any).port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
  }
}
test("server rejects arbitrary proxy URLs", () =>
  withServer(async (u) => {
    assert.equal(
      (await fetch(`${u}/api/case?url=http://127.0.0.1`)).status,
      400,
    );
  }));
test("server rejects non-GET actions", () =>
  withServer(async (u) => {
    assert.equal((await fetch(u, { method: "POST" })).status, 405);
  }));
test("server rejects foreign origins", () =>
  withServer(async (u) => {
    assert.equal(
      (
        await fetch(`${u}/fixtures/completed.json`, {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
  }));
test("server rejects hostile Host headers", () =>
  withServer(async (u) => {
    const status = await new Promise((r) => {
      const req = request(u, { headers: { Host: "evil.example" } }, (res) => {
        res.resume();
        r(res.statusCode);
      });
      req.end();
    });
    assert.equal(status, 403);
  }));
test("fixture replay remains available without upstream", () =>
  withServer(async (u) => {
    const r = await fetch(`${u}/fixtures/completed.json`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).mode, "fixture");
  }));
test("static traversal and unknown fixtures cannot expose files", () =>
  withServer(async (u) => {
    assert.equal((await fetch(`${u}/fixtures/package.json`)).status, 404);
    assert.equal((await fetch(`${u}/src/server.ts`)).status, 404);
  }));
test("malformed request target returns 400 without crashing its own server", async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "ignore"],
  });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("start_timeout")), 5000);
      child.stdout?.on("data", (d) => {
        const m = String(d).match(/CASEFILE_URL=(http:\/\/127\.0\.0\.1:\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
    });
    const u = new URL(url);
    const status = await new Promise<number | string>((resolve) => {
      const r = request(
        {
          hostname: u.hostname,
          port: u.port,
          path: "http://%",
          headers: { Host: u.host },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      r.on("error", () => resolve("crashed"));
      r.end();
    });
    assert.equal(status, 400);
  } finally {
    child.kill();
  }
});
