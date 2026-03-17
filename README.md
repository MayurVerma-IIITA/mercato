# Mercato

Mercato is a distributed order management system prototype designed around modular services, event-driven synchronization, and secure access controls. This implementation focuses on catalog, inventory, and order flows with service boundaries that are Kafka-ready while still being runnable locally with only Node.js.

## Live Demo

[https://mercato-c3gh.onrender.com/](https://mercato-c3gh.onrender.com/)

## What is included

- Browser-based control room UI
- Separate HTTP services for `auth`, `catalog`, `inventory`, and `order`
- Event contracts and an in-memory broker that mirrors Kafka topic usage
- JWT-based authentication using HS256
- Role-Based Access Control for catalog, inventory, and order operations
- Event-driven state propagation between services
- Simple observability endpoints to inspect throughput and propagation delay
- A smoke test that exercises cross-service synchronization

## Architecture

```text
Clients -> Auth Service -> JWT
Clients -> Catalog Service ----\
Clients -> Inventory Service ---+--> Event Bus (Kafka-ready topic contracts)
Clients -> Order Service ------/

Catalog events -> Inventory projection sync
Inventory events -> Catalog availability sync
Order commands -> Inventory reservations + order events
```

## Roles

- `admin`: full access
- `catalog-manager`: create and update catalog
- `inventory-manager`: update inventory
- `sales-ops`: create orders
- `order-service`: reserve and release stock programmatically

## Run locally

```bash
node src/local-cluster.js
```

The local cluster starts these services:

- UI: `http://localhost:3000`
- Auth: `http://localhost:4000`
- Catalog: `http://localhost:4001`
- Inventory: `http://localhost:4002`
- Order: `http://localhost:4003`

Open `http://localhost:3000` to use the frontend dashboard.

## Generate tokens

```bash
curl -X POST http://localhost:4000/auth/token \
  -H "content-type: application/json" \
  -d "{\"subject\":\"ops-user\",\"roles\":[\"admin\"]}"
```

Use the returned token as `Authorization: Bearer <token>`.

## Example flow

1. Create a product in catalog.
2. Update stock in inventory.
3. Create an order.
4. Watch the order service reserve stock and emit events from the UI or API.
5. Read metrics from `/metrics` on any service.

## Smoke test

```bash
node src/smoke-test.js
```

The smoke test validates the backend flow and confirms the UI entrypoint is reachable.

## Frontend

The frontend is a no-build static dashboard served by the UI service. It supports:

- generating JWT tokens
- creating catalog products
- setting inventory
- creating orders
- viewing orders and products
- refreshing service metrics

Frontend files:

- `ui/index.html`
- `ui/styles.css`
- `ui/app.js`

## Deploy

### Docker

Build and run:

```bash
docker build -t mercato .
docker run -p 3000:3000 -p 4000:4000 -p 4001:4001 -p 4002:4002 -p 4003:4003 mercato
```

### Docker Compose

```bash
docker compose up --build
```

This starts:

- the Mercato app container
- a Redpanda container for future Kafka-backed evolution

### Production note

The current deployment artifact runs the demo system in a single Node process. That is fine for demos, interviews, internal previews, and functional validation. For production, split the services into separate deployable units and replace the in-memory event bus with a Kafka client adapter.

## Kafka-ready boundary

The `EventBus` abstraction keeps topics and payloads explicit. In production, the in-memory adapter can be replaced with Kafka producers and consumers without changing service-level business logic.

Topic contracts:

- `catalog.product.upserted`
- `inventory.stock.changed`
- `inventory.stock.reserved`
- `inventory.stock.released`
- `order.created`
- `order.status.changed`

## Docker Compose

`docker-compose.yml` includes a Redpanda broker definition as a production-aligned local message bus option. The current Node prototype does not require it to run.
