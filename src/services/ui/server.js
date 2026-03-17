import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../shared/config.js";
import { notFound, parseUrl, serveStaticFile, sendJson } from "../../shared/http.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const uiRoot = path.resolve(currentDir, "../../../ui");

async function proxyRequest(req, res, targetBaseUrl, rewrittenPathname) {
  const url = parseUrl(req);
  const targetUrl = new URL(rewrittenPathname + url.search, targetBaseUrl);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string" && key.toLowerCase() !== "host") {
      headers.set(key, value);
    }
  }

  let body;
  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  }

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body
  });

  const responseBuffer = Buffer.from(await response.arrayBuffer());
  const forwardedHeaders = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "transfer-encoding") {
      forwardedHeaders[key] = value;
    }
  });

  res.writeHead(response.status, forwardedHeaders);
  res.end(responseBuffer);
}

export function createUiService() {
  const serviceName = "ui-service";
  const proxies = [
    {
      prefix: "/api/auth",
      targetBaseUrl: `http://localhost:${config.ports.auth}`,
      targetPrefix: "/auth"
    },
    {
      prefix: "/api/catalog",
      targetBaseUrl: `http://localhost:${config.ports.catalog}`,
      targetPrefix: "/catalog"
    },
    {
      prefix: "/api/inventory",
      targetBaseUrl: `http://localhost:${config.ports.inventory}`,
      targetPrefix: "/inventory"
    },
    {
      prefix: "/api/orders",
      targetBaseUrl: `http://localhost:${config.ports.order}`,
      targetPrefix: "/orders"
    },
    {
      prefix: "/api/metrics/catalog",
      targetBaseUrl: `http://localhost:${config.ports.catalog}`,
      targetPrefix: "/metrics"
    },
    {
      prefix: "/api/metrics/inventory",
      targetBaseUrl: `http://localhost:${config.ports.inventory}`,
      targetPrefix: "/metrics"
    },
    {
      prefix: "/api/metrics/orders",
      targetBaseUrl: `http://localhost:${config.ports.order}`,
      targetPrefix: "/metrics"
    }
  ];

  return http.createServer(async (req, res) => {
    const url = parseUrl(req);

    if (url.pathname === "/health") {
      return sendJson(res, 200, { service: serviceName, ok: true });
    }

    if (url.pathname === "/config.js") {
      const payload = `window.MERCATO_CONFIG = ${JSON.stringify({
        authBaseUrl: "/api/auth",
        catalogBaseUrl: "/api/catalog",
        inventoryBaseUrl: "/api/inventory",
        orderBaseUrl: "/api/orders",
        metrics: {
          catalog: "/api/metrics/catalog",
          inventory: "/api/metrics/inventory",
          orders: "/api/metrics/orders"
        }
      })};`;

      res.writeHead(200, {
        "content-type": "application/javascript; charset=utf-8",
        "content-length": Buffer.byteLength(payload),
        "cache-control": "no-store"
      });
      res.end(payload);
      return;
    }

    for (const proxy of proxies) {
      if (url.pathname === proxy.prefix || url.pathname.startsWith(`${proxy.prefix}/`)) {
        const suffix = url.pathname.slice(proxy.prefix.length);
        const rewritten = `${proxy.targetPrefix}${suffix}`;
        return proxyRequest(req, res, proxy.targetBaseUrl, rewritten);
      }
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return serveStaticFile(res, path.join(uiRoot, "index.html"));
    }

    if (url.pathname === "/styles.css") {
      return serveStaticFile(res, path.join(uiRoot, "styles.css"));
    }

    if (url.pathname === "/app.js") {
      return serveStaticFile(res, path.join(uiRoot, "app.js"));
    }

    return notFound(res, serviceName);
  });
}
