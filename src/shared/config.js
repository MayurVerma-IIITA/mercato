export const config = Object.freeze({
  jwtSecret: process.env.MERCATO_JWT_SECRET || "mercato-dev-secret",
  brokerLatencyMs: Number(process.env.MERCATO_BROKER_LATENCY_MS || 50),
  ports: {
    ui: Number(process.env.PORT || process.env.MERCATO_UI_PORT || 3000),
    auth: Number(process.env.MERCATO_AUTH_PORT || 4000),
    catalog: Number(process.env.MERCATO_CATALOG_PORT || 4001),
    inventory: Number(process.env.MERCATO_INVENTORY_PORT || 4002),
    order: Number(process.env.MERCATO_ORDER_PORT || 4003)
  }
});
