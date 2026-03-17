import http from "node:http";
import { config } from "../../shared/config.js";
import {
  handleCors,
  methodNotAllowed,
  notFound,
  parseUrl,
  readJsonBody,
  sendJson
} from "../../shared/http.js";
import { signJwt } from "../../shared/jwt.js";

export function createAuthService() {
  const serviceName = "auth-service";

  return http.createServer(async (req, res) => {
    if (handleCors(req, res)) {
      return;
    }

    const url = parseUrl(req);

    if (url.pathname === "/health") {
      return sendJson(res, 200, { service: serviceName, ok: true });
    }

    if (url.pathname === "/auth/token") {
      if (req.method !== "POST") {
        return methodNotAllowed(res, ["POST"]);
      }

      const body = await readJsonBody(req);
      const subject = body.subject || "mercato-user";
      const roles = Array.isArray(body.roles) ? body.roles : [];
      const expiresInSeconds = Number(body.expiresInSeconds || 3600);
      const token = signJwt({ sub: subject, roles }, config.jwtSecret, expiresInSeconds);

      return sendJson(res, 200, {
        token,
        subject,
        roles,
        expiresInSeconds
      });
    }

    return notFound(res, serviceName);
  });
}
