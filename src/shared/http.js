import fs from "node:fs/promises";
import path from "node:path";

export function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization"
  });
  res.end(body);
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

export function notFound(res, serviceName) {
  sendJson(res, 404, {
    error: "Not Found",
    service: serviceName
  });
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("allow", allowed.join(", "));
  sendJson(res, 405, { error: "Method Not Allowed", allowed });
}

export function parseUrl(req) {
  return new URL(req.url, `http://${req.headers.host || "localhost"}`);
}

export function handleCors(req, res) {
  if (req.method !== "OPTIONS") {
    return false;
  }

  res.writeHead(204, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization"
  });
  res.end();
  return true;
}

export async function serveStaticFile(res, filePath) {
  try {
    const body = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    }[extension] || "application/octet-stream";

    res.writeHead(200, {
      "content-type": contentType,
      "content-length": body.length,
      "access-control-allow-origin": "*",
      "cache-control": "no-store"
    });
    res.end(body);
  } catch (error) {
    sendJson(res, 404, { error: "Static asset not found" });
  }
}
