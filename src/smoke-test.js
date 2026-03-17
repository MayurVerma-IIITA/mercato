import assert from "node:assert/strict";
import { config } from "./shared/config.js";
import { startLocalCluster } from "./local-cluster.js";

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

async function main() {
  const cluster = await startLocalCluster();

  try {
    const uiResponse = await fetch(`http://localhost:${config.ports.ui}`);
    assert.equal(uiResponse.status, 200);

    const tokenResponse = await request(`http://localhost:${config.ports.auth}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: "integration-admin",
        roles: ["admin", "sales-ops"]
      })
    });

    assert.equal(tokenResponse.status, 200);
    const token = tokenResponse.body.token;
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    };

    const productResponse = await request(
      `http://localhost:${config.ports.catalog}/catalog/products`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          sku: "SKU-1",
          name: "Mercato Sneaker",
          price: 125
        })
      }
    );

    assert.equal(productResponse.status, 201);

    const inventoryResponse = await request(
      `http://localhost:${config.ports.inventory}/inventory/stock/SKU-1`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ available: 10 })
      }
    );

    assert.equal(inventoryResponse.status, 200);
    assert.equal(inventoryResponse.body.available, 10);

    await new Promise((resolve) => setTimeout(resolve, config.brokerLatencyMs + 25));

    const catalogProjection = await request(
      `http://localhost:${config.ports.catalog}/catalog/products/SKU-1`,
      {
        headers: {
          authorization: `Bearer ${token}`
        }
      }
    );

    assert.equal(catalogProjection.status, 200);
    assert.equal(catalogProjection.body.inventory.available, 10);

    const orderResponse = await request(`http://localhost:${config.ports.order}/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sku: "SKU-1", quantity: 3 })
    });

    assert.equal(orderResponse.status, 201);
    assert.equal(orderResponse.body.status, "reserved");

    const finalInventory = await request(
      `http://localhost:${config.ports.inventory}/inventory/stock/SKU-1`,
      {
        headers: {
          authorization: `Bearer ${token}`
        }
      }
    );

    assert.equal(finalInventory.status, 200);
    assert.equal(finalInventory.body.available, 7);
    assert.equal(finalInventory.body.reserved, 3);

    console.log("Smoke test passed");
  } finally {
    await cluster.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
