export const TOPICS = Object.freeze({
  catalogProductUpserted: "catalog.product.upserted",
  inventoryStockChanged: "inventory.stock.changed",
  inventoryStockReserved: "inventory.stock.reserved",
  inventoryStockReleased: "inventory.stock.released",
  orderCreated: "order.created",
  orderStatusChanged: "order.status.changed"
});

export const ROLES = Object.freeze({
  admin: "admin",
  catalogManager: "catalog-manager",
  inventoryManager: "inventory-manager",
  salesOps: "sales-ops",
  orderService: "order-service"
});
