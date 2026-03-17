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
    const tokenResponse = await request(`http://localhost:${config.ports.auth}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: "mercato-admin",
        roles: ["admin", "sales-ops"]
      })
    });

    const token = tokenResponse.body.token;
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    };

    const product = await request(`http://localhost:${config.ports.catalog}/catalog/products`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sku: "SKU-RED-TSHIRT",
        name: "Mercato Tee",
        price: 25
      })
    });

    const stock = await request(
      `http://localhost:${config.ports.inventory}/inventory/stock/SKU-RED-TSHIRT`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ available: 20 })
      }
    );

    const order = await request(`http://localhost:${config.ports.order}/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sku: "SKU-RED-TSHIRT", quantity: 2 })
    });

    const metrics = await request(`http://localhost:${config.ports.order}/metrics`, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    console.log(JSON.stringify({ product, stock, order, metrics }, null, 2));
  } finally {
    await cluster.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
