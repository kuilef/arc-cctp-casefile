import { createServer as httpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { collect } from "./collector";
import { validHash } from "./transport";
const ROOT = resolve(import.meta.dirname, "..");
export function createServer() {
  let active = false;
  return httpServer(async (req, res) => {
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    };
    const send = (status: number, value: any, type = "application/json") => {
      res.writeHead(status, { ...headers, "Content-Type": type });
      res.end(type === "application/json" ? JSON.stringify(value) : value);
    };
    const host = req.headers.host ?? "";
    if (
      ![
        `127.0.0.1:${req.socket.localPort}`,
        `localhost:${req.socket.localPort}`,
      ].includes(host) ||
      (req.headers.origin && req.headers.origin !== `http://${host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      send(403, { error: "local_origin_required" });
      return;
    }
    if (req.method !== "GET") {
      send(405, { error: "get_only" });
      return;
    }
    if ((req.url?.length ?? 0) > 4096) {
      send(400, { error: "request_too_large" });
      return;
    }
    let url: URL;
    try {
      url = new URL(req.url ?? "/", `http://${host}`);
    } catch {
      send(400, { error: "invalid_request_target" });
      return;
    }
    try {
      if (url.pathname === "/api/case") {
        const keys = [...url.searchParams.keys()];
        const source = url.searchParams.get("source") ?? "";
        const destination = url.searchParams.get("destination") || undefined;
        const index = url.searchParams.get("logIndex");
        if (
          keys.some(
            (k) => !["source", "destination", "logIndex"].includes(k),
          ) ||
          new Set(keys).size !== keys.length ||
          !validHash(source) ||
          (destination && !validHash(destination)) ||
          (index !== null && !/^\d{1,8}$/.test(index))
        ) {
          send(400, { error: "invalid_case_parameters" });
          return;
        }
        if (active) {
          send(429, { error: "one_collection_at_a_time" });
          return;
        }
        active = true;
        try {
          send(
            200,
            await collect(
              source,
              destination,
              index === null ? undefined : Number(index),
            ),
          );
        } finally {
          active = false;
        }
        return;
      }
      const fixture =
        /^\/fixtures\/(completed|unobserved|unavailable|multi)\.json$/.test(
          url.pathname,
        );
      const asset = /^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(url.pathname);
      if (url.pathname !== "/" && !fixture && !asset) {
        send(404, { error: "not_found" });
        return;
      }
      const path = fixture
        ? resolve(ROOT, `.${url.pathname}`)
        : resolve(
            ROOT,
            "dist",
            url.pathname === "/" ? "index.html" : `.${url.pathname}`,
          );
      const data = await readFile(path);
      const type = fixture
        ? "application/json"
        : path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".css")
            ? "text/css"
            : "text/html";
      res.writeHead(200, { ...headers, "Content-Type": type });
      res.end(data);
    } catch {
      send(500, { error: "local_read_failed_build_first" });
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
) {
  const port = Number(process.env.PORT ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw Error("invalid_loopback_port");
  const server = createServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(
      `CASEFILE_URL=http://127.0.0.1:${(server.address() as any).port}`,
    );
  });
}
