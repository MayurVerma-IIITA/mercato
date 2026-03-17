import http from "node:http";
import { randomUUID } from "node:crypto";
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
import { signJwt } from "../../shared/jwt.js";

export function createOrderService({ eventBus, jwtSecret, inventoryBaseUrl }) {
  const serviceName = "order-service";
  const orders = new Map();
  const inventoryProjection = new Map();

  eventBus.subscribe(TOPICS.inventoryStockChanged, async (event) => {
    inventoryProjection.set(event.payload.sku, event.payload);
  });

  async function reserveInventory(sku, quantity) {
    const serviceToken = signJwt(
      { sub: "mercato-order-service", roles: [ROLES.orderService] },
      jwtSecret,
      3600
    );

    const response = await fetch(`${inventoryBaseUrl}/inventory/reservations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceToken}`
      },
      body: JSON.stringify({ sku, quantity })
    });

    const body = await response.json();
    if (!response.ok) {
      const error = new Error(body.error || "Inventory reservation failed");
      error.details = body;
      throw error;
    }

    return body;
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
        orderCount: orders.size,
        inventoryProjectionSize: inventoryProjection.size,
        eventBus: eventBus.snapshot()
      });
    }

    if (url.pathname === "/orders" && req.method === "GET") {
      const user = authorize(req, res, jwtSecret, []);
      if (!user) {
        return;
      }

      return sendJson(res, 200, { items: Array.from(orders.values()) });
    }

    if (url.pathname === "/orders" && req.method === "POST") {
      const user = authorize(req, res, jwtSecret, [ROLES.admin, ROLES.salesOps]);
      if (!user) {
        return;
      }

      const body = await readJsonBody(req);
      const sku = body.sku;
      const quantity = Number(body.quantity || 0);

      if (!sku || quantity <= 0) {
        return sendJson(res, 400, { error: "sku and quantity > 0 are required" });
      }

      try {
        const reservation = await reserveInventory(sku, quantity);
        const order = {
          orderId: randomUUID(),
          sku,
          quantity,
          status: "reserved",
          reservationId: reservation.reservationId,
          createdBy: user.sub,
          createdAt: new Date().toISOString()
        };

        orders.set(order.orderId, order);
        await eventBus.publish(TOPICS.orderCreated, order);
        await eventBus.publish(TOPICS.orderStatusChanged, {
          orderId: order.orderId,
          status: order.status,
          changedAt: new Date().toISOString()
        });

        return sendJson(res, 201, order);
      } catch (error) {
        return sendJson(res, 409, {
          error: error.message,
          details: error.details || null
        });
      }
    }

    return notFound(res, serviceName);
  });
}
