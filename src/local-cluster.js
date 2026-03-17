import { config } from "./shared/config.js";
import { EventBus } from "./shared/event-bus.js";
import { createAuthService } from "./services/auth/server.js";
import { createCatalogService } from "./services/catalog/server.js";
import { createInventoryService } from "./services/inventory/server.js";
import { createOrderService } from "./services/order/server.js";
import { createUiService } from "./services/ui/server.js";
import { pathToFileURL } from "node:url";

function listen(server, port, name) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`${name} listening on http://localhost:${port}`);
      resolve();
    });
  });
}

export async function startLocalCluster() {
  const eventBus = new EventBus({ latencyMs: config.brokerLatencyMs });
  const authService = createAuthService();
  const catalogService = createCatalogService({ eventBus, jwtSecret: config.jwtSecret });
  const inventoryService = createInventoryService({ eventBus, jwtSecret: config.jwtSecret });
  const orderService = createOrderService({
    eventBus,
    jwtSecret: config.jwtSecret,
    inventoryBaseUrl: `http://localhost:${config.ports.inventory}`
  });
  const uiService = createUiService();

  await listen(uiService, config.ports.ui, "ui-service");
  await listen(authService, config.ports.auth, "auth-service");
  await listen(catalogService, config.ports.catalog, "catalog-service");
  await listen(inventoryService, config.ports.inventory, "inventory-service");
  await listen(orderService, config.ports.order, "order-service");

  return {
    stop: async () => {
      await Promise.all(
        [uiService, authService, catalogService, inventoryService, orderService].map(
          (server) =>
            new Promise((resolve, reject) => {
              server.close((error) => {
                if (error) {
                  reject(error);
                  return;
                }
                resolve();
              });
            })
        )
      );
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startLocalCluster().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
