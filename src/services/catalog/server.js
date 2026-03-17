import http from "node:http";
import { authorize } from "../../shared/auth.js";
import { ROLES, TOPICS } from "../../shared/contracts.js";
import {
  handleCors,
  methodNotAllowed,
  notFound,
  parseUrl,
  readJsonBody,
  sendJson
} from "../../shared/http.js";

export function createCatalogService({ eventBus, jwtSecret }) {
  const serviceName = "catalog-service";
  const products = new Map();

  eventBus.subscribe(TOPICS.inventoryStockChanged, async (event) => {
    const { sku, available, reserved, updatedAt } = event.payload;
    const existing = products.get(sku);
    if (!existing) {
      return;
    }

    products.set(sku, {
      ...existing,
      inventory: {
        available,
        reserved,
        updatedAt
      }
    });
  });

  function listProducts() {
    return Array.from(products.values());
  }

  return http.createServer(async (req, res) => {
    if (handleCors(req, res)) {
      return;
    }

    const url = parseUrl(req);

    if (url.pathname === "/health") {
      return sendJson(res, 200, { service: serviceName, ok: true });
    }

    if (url.pathname === "/metrics") {
      return sendJson(res, 200, {
        service: serviceName,
        productCount: products.size,
        projectionLagTargetMs: 2000,
        eventBus: eventBus.snapshot()
      });
    }

    if (url.pathname === "/catalog/products" && req.method === "GET") {
      const user = authorize(req, res, jwtSecret, []);
      if (!user) {
        return;
      }

      return sendJson(res, 200, { items: listProducts() });
    }

    if (url.pathname === "/catalog/products" && req.method === "POST") {
      const user = authorize(req, res, jwtSecret, [ROLES.admin, ROLES.catalogManager]);
      if (!user) {
        return;
      }

      const body = await readJsonBody(req);
      if (!body.sku || !body.name) {
        return sendJson(res, 400, { error: "sku and name are required" });
      }

      const product = {
        sku: body.sku,
        name: body.name,
        price: Number(body.price || 0),
        description: body.description || "",
        active: body.active !== false,
        updatedBy: user.sub,
        updatedAt: new Date().toISOString(),
        inventory: products.get(body.sku)?.inventory || {
          available: 0,
          reserved: 0,
          updatedAt: null
        }
      };

      products.set(product.sku, product);
      await eventBus.publish(TOPICS.catalogProductUpserted, product);
      return sendJson(res, 201, product);
    }

    if (url.pathname.startsWith("/catalog/products/")) {
      const sku = decodeURIComponent(url.pathname.split("/").pop());

      if (req.method === "GET") {
        const user = authorize(req, res, jwtSecret, []);
        if (!user) {
          return;
        }

        const product = products.get(sku);
        if (!product) {
          return sendJson(res, 404, { error: "Product not found", sku });
        }

        return sendJson(res, 200, product);
      }

      if (req.method === "PATCH") {
        const user = authorize(req, res, jwtSecret, [ROLES.admin, ROLES.catalogManager]);
        if (!user) {
          return;
        }

        const existing = products.get(sku);
        if (!existing) {
          return sendJson(res, 404, { error: "Product not found", sku });
        }

        const body = await readJsonBody(req);
        const product = {
          ...existing,
          ...body,
          sku,
          updatedBy: user.sub,
          updatedAt: new Date().toISOString()
        };

        products.set(sku, product);
        await eventBus.publish(TOPICS.catalogProductUpserted, product);
        return sendJson(res, 200, product);
      }

      return methodNotAllowed(res, ["GET", "PATCH"]);
    }

    return notFound(res, serviceName);
  });
}
