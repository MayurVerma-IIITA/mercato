const defaults = window.MERCATO_CONFIG || {};

const state = {
  token: localStorage.getItem("mercato.token") || "",
  authBaseUrl: defaults.authBaseUrl,
  catalogBaseUrl: defaults.catalogBaseUrl,
  inventoryBaseUrl: defaults.inventoryBaseUrl,
  orderBaseUrl: defaults.orderBaseUrl,
  metrics: defaults.metrics || {},
  log: []
};

const sessionState = document.querySelector("#session-state");
const tokenOutput = document.querySelector("#token-output");
const productsView = document.querySelector("#products-view");
const ordersView = document.querySelector("#orders-view");
const metricsView = document.querySelector("#metrics-view");
const activityLog = document.querySelector("#activity-log");

function setToken(token) {
  state.token = token;
  tokenOutput.value = token;
  if (token) {
    localStorage.setItem("mercato.token", token);
    sessionState.textContent = "Token loaded";
  } else {
    localStorage.removeItem("mercato.token");
    sessionState.textContent = "No token loaded";
  }
}

function logActivity(title, detail, tone = "info") {
  state.log.unshift({
    title,
    detail,
    tone,
    createdAt: new Date().toLocaleTimeString()
  });

  if (state.log.length > 12) {
    state.log.pop();
  }

  renderLog();
}

function renderLog() {
  if (state.log.length === 0) {
    activityLog.className = "log-view empty";
    activityLog.innerHTML = "No activity yet.";
    return;
  }

  activityLog.className = "log-view";
  activityLog.innerHTML = state.log
    .map(
      (entry) => `
        <article class="log-entry">
          <header>
            <strong>${entry.title}</strong>
            <span class="mini-label">${entry.createdAt}</span>
          </header>
          <div>${entry.detail}</div>
        </article>
      `
    )
    .join("");
}

async function apiRequest(baseUrl, pathname, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.token) {
    headers.set("authorization", `Bearer ${state.token}`);
  }
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof body === "string" ? body : body.message || body.error || "Request failed";
    throw new Error(message);
  }

  return body;
}

function renderProducts(items) {
  if (!items.length) {
    productsView.className = "card-list empty";
    productsView.textContent = "No products yet.";
    return;
  }

  productsView.className = "card-list";
  productsView.innerHTML = items
    .map(
      (item) => `
        <article class="data-card">
          <header>
            <strong>${item.name}</strong>
            <span class="mini-label">${item.sku}</span>
          </header>
          <div class="meta-row">
            <span>Price: $${Number(item.price || 0).toFixed(2)}</span>
            <span>Available: ${item.inventory?.available ?? 0}</span>
            <span>Reserved: ${item.inventory?.reserved ?? 0}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderOrders(items) {
  if (!items.length) {
    ordersView.className = "card-list empty";
    ordersView.textContent = "No orders yet.";
    return;
  }

  ordersView.className = "card-list";
  ordersView.innerHTML = items
    .map(
      (item) => `
        <article class="data-card">
          <header>
            <strong>${item.orderId.slice(0, 8)}...</strong>
            <span class="mini-label">${item.status}</span>
          </header>
          <div class="meta-row">
            <span>SKU: ${item.sku}</span>
            <span>Qty: ${item.quantity}</span>
            <span>Reservation: ${item.reservationId.slice(0, 8)}...</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderMetrics(metrics) {
  metricsView.innerHTML = metrics
    .map(
      ({ name, payload }) => `
        <article class="metric-card">
          <span>${name}</span>
          <strong>${payload.eventBus?.published ?? 0}</strong>
          <p>
            Delivered: ${payload.eventBus?.delivered ?? 0}<br>
            Avg propagation: ${payload.eventBus?.averagePropagationDelayMs ?? 0}ms
          </p>
        </article>
      `
    )
    .join("");
}

async function refreshData() {
  const [products, orders] = await Promise.all([
    apiRequest("", "/api/catalog/products"),
    apiRequest("", "/api/orders")
  ]);

  renderProducts(products.items || []);
  renderOrders(orders.items || []);
  logActivity("Data refreshed", "Catalog products and orders were reloaded.");
}

async function refreshMetrics() {
  const metricEntries = await Promise.all([
    apiRequest("", state.metrics.catalog || "/api/metrics/catalog").then((payload) => ({
      name: "Catalog service",
      payload
    })),
    apiRequest("", state.metrics.inventory || "/api/metrics/inventory").then((payload) => ({
      name: "Inventory service",
      payload
    })),
    apiRequest("", state.metrics.orders || "/api/metrics/orders").then((payload) => ({
      name: "Order service",
      payload
    }))
  ]);

  renderMetrics(metricEntries);
  logActivity("Metrics refreshed", "Service event throughput and latency were reloaded.");
}

document.querySelector("#token-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  try {
    const payload = await apiRequest("", "/api/auth/token", {
      method: "POST",
      body: JSON.stringify({
        subject: form.get("subject"),
        roles: String(form.get("roles"))
          .split(",")
          .map((role) => role.trim())
          .filter(Boolean),
        expiresInSeconds: Number(form.get("expiresInSeconds"))
      })
    });

    setToken(payload.token);
    logActivity("Token generated", `Issued roles: ${(payload.roles || []).join(", ")}`);
    await Promise.all([refreshData(), refreshMetrics()]);
  } catch (error) {
    logActivity("Token request failed", error.message, "error");
  }
});

document.querySelector("#clear-token").addEventListener("click", () => {
  setToken("");
  renderProducts([]);
  renderOrders([]);
  metricsView.innerHTML = "";
  logActivity("Session cleared", "Stored token removed from the browser.");
});

document.querySelector("#product-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);

  try {
    const payload = await apiRequest("", "/api/catalog/products", {
      method: "POST",
      body: JSON.stringify({
        sku: form.get("sku"),
        name: form.get("name"),
        price: Number(form.get("price")),
        description: form.get("description")
      })
    });

    logActivity("Product published", `${payload.sku} is now available in catalog.`);
    formElement.reset();
    await Promise.all([refreshData(), refreshMetrics()]);
  } catch (error) {
    logActivity("Product publish failed", error.message, "error");
  }
});

document.querySelector("#inventory-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const sku = form.get("sku");

  try {
    const payload = await apiRequest("", `/api/inventory/stock/${encodeURIComponent(sku)}`, {
      method: "PUT",
      body: JSON.stringify({
        available: Number(form.get("available"))
      })
    });

    logActivity("Inventory updated", `${payload.sku} now has ${payload.available} units available.`);
    await Promise.all([refreshData(), refreshMetrics()]);
  } catch (error) {
    logActivity("Inventory update failed", error.message, "error");
  }
});

document.querySelector("#order-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  try {
    const payload = await apiRequest("", "/api/orders", {
      method: "POST",
      body: JSON.stringify({
        sku: form.get("sku"),
        quantity: Number(form.get("quantity"))
      })
    });

    logActivity(
      "Order reserved",
      `Order ${payload.orderId.slice(0, 8)} reserved ${payload.quantity} units of ${payload.sku}.`
    );
    await Promise.all([refreshData(), refreshMetrics()]);
  } catch (error) {
    logActivity("Order creation failed", error.message, "error");
  }
});

document.querySelector("#refresh-data").addEventListener("click", () => {
  refreshData().catch((error) => logActivity("Refresh failed", error.message, "error"));
});

document.querySelector("#refresh-metrics").addEventListener("click", () => {
  refreshMetrics().catch((error) => logActivity("Metrics failed", error.message, "error"));
});

setToken(state.token);
renderProducts([]);
renderOrders([]);
renderLog();

if (state.token) {
  Promise.all([refreshData(), refreshMetrics()]).catch((error) => {
    logActivity("Initial load failed", error.message, "error");
  });
}
