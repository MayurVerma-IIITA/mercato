import { sendJson } from "./http.js";
import { verifyJwt } from "./jwt.js";

export function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length);
}

export function authenticate(req, secret) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error("Missing bearer token");
  }

  return verifyJwt(token, secret);
}

export function authorize(req, res, secret, allowedRoles = []) {
  try {
    const user = authenticate(req, secret);
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const permitted =
      allowedRoles.length === 0 || roles.some((role) => allowedRoles.includes(role));

    if (!permitted) {
      sendJson(res, 403, {
        error: "Forbidden",
        requiredRoles: allowedRoles
      });
      return null;
    }

    req.user = user;
    return user;
  } catch (error) {
    sendJson(res, 401, {
      error: "Unauthorized",
      message: error.message
    });
    return null;
  }
}
