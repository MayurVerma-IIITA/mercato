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

export function createInventoryService({ eventBus, jwtSecret }) {
  const serviceName = "inventory-service";
  const inventory = new Map();
  const reservations = new Map();

  eventBus.subscribe(TOPICS.catalogProductUpserted, async (event) => {
    const { sku } = event.payload;
    if (!inventory.has(sku)) {
      inventory.set(sku, {
        sku,
        available: 0,
        reserved: 0,
        updatedAt: new Date().toISOString()
      });
    }
  });

  async function emitStockChanged(record) {
    await eventBus.publish(TOPICS.inventoryStockChanged, record);
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
        skuCount: inventory.size,
        reservationCount: reservations.size,
        eventBus: eventBus.snapshot()
      });
    }

    if (url.pathname.startsWith("/inventory/stock/")) {
      const sku = decodeURIComponent(url.pathname.split("/").pop());

      if (req.method === "GET") {
        const user = authorize(req, res, jwtSecret, []);
        if (!user) {
          return;
        }

        const record = inventory.get(sku);
        if (!record) {
          return sendJson(res, 404, { error: "Inventory record not found", sku });
        }

        return sendJson(res, 200, record);
      }

      if (req.method === "PUT") {
        const user = authorize(req, res, jwtSecret, [ROLES.admin, ROLES.inventoryManager]);
        if (!user) {
          return;
        }

        const body = await readJsonBody(req);
        const available = Number(body.available ?? 0);
        const existing = inventory.get(sku) || { sku, reserved: 0 };
        const record = {
          sku,
          available,
          reserved: existing.reserved || 0,
          updatedAt: new Date().toISOString(),
          updatedBy: user.sub
        };

        inventory.set(sku, record);
        await emitStockChanged(record);
        return sendJson(res, 200, record);
      }

      return methodNotAllowed(res, ["GET", "PUT"]);
    }

    if (url.pathname === "/inventory/reservations") {
      if (req.method !== "POST") {
        return methodNotAllowed(res, ["POST"]);
      }

      const user = authorize(req, res, jwtSecret, [ROLES.admin, ROLES.orderService]);
      if (!user) {
        return;
      }

      const body = await readJsonBody(req);
      const sku = body.sku;
      const quantity = Number(body.quantity || 0);
      const record = inventory.get(sku);

      if (!record) {
        return sendJson(res, 404, { error: "Inventory record not found", sku });
      }

      if (quantity <= 0) {
        return sendJson(res, 400, { error: "quantity must be greater than zero" });
      }

      if (record.available < quantity) {
        return sendJson(res, 409, {
          error: "Insufficient stock",
          sku,
          available: record.available,
          requested: quantity
        });
      }

      record.available -= quantity;
      record.reserved += quantity;
      record.updatedAt = new Date().toISOString();
      inventory.set(sku, record);

      const reservation = {
        reservationId: randomUUID(),
        sku,
        quantity,
        createdAt: new Date().toISOString(),
        createdBy: user.sub,
        status: "reserved"
      };
      reservations.set(reservation.reservationId, reservation);

      await emitStockChanged(record);
      await eventBus.publish(TOPICS.inventoryStockReserved, reservation);
      return sendJson(res, 201, reservation);
    }

    if (url.pathname.startsWith("/inventory/reservations/")) {
      const reservationId = decodeURIComponent(url.pathname.split("/").pop());
      if (req.method !== "DELETE") {
        return methodNotAllowed(res, ["DELETE"]);
      }

      const user = authorize(req, res, jwtSecret, [ROLES.admin, ROLES.orderService]);
      if (!user) {
        return;
      }

      const reservation = reservations.get(reservationId);
      if (!reservation) {
        return sendJson(res, 404, { error: "Reservation not found", reservationId });
      }

      const record = inventory.get(reservation.sku);
      if (record) {
        record.available += reservation.quantity;
        record.reserved -= reservation.quantity;
        record.updatedAt = new Date().toISOString();
        inventory.set(reservation.sku, record);
        await emitStockChanged(record);
      }

      reservations.delete(reservationId);
      await eventBus.publish(TOPICS.inventoryStockReleased, {
        ...reservation,
        releasedAt: new Date().toISOString(),
        releasedBy: user.sub
      });

      return sendJson(res, 200, { released: true, reservationId });
    }

    return notFound(res, serviceName);
  });
}
