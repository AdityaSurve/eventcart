# EventCart

EventCart is a full-stack **event merchandise shop**: customers browse products, hold a cart, check out into orders, and track fulfillment. Admins manage catalog and order status.

It is built as two apps that talk over REST:

| App | Path | Runtime |
|-----|------|---------|
| API | `server/` | NestJS on `http://localhost:3000` |
| Shop UI | `client/` | React + Vite on `http://localhost:5173` |

---

## What the system does

1. **Catalog** — products with name, slug, price, and stock in PostgreSQL.
2. **Accounts** — customers register/login; admins have extra routes.
3. **Cart** — pre-checkout items live in Redis (not in the database).
4. **Checkout** — cart (or a direct order payload) becomes an `Order` with line items, totals, and stock decrements in a single transaction.
5. **Fulfillment** — admins move status (`PENDING` → `CONFIRMED` → … or `CANCELLED`). Each change is appended to `OrderStatusHistory`.
6. **Async side effects** — after an order is placed or its status changes, Nest publishes Kafka events. A consumer logs a simulated email/notification so the HTTP request does not wait on those jobs.

---

## Architecture

```
Browser (React + Vite :5173)
        │  REST + JWT (Authorization: Bearer)
        ▼
NestJS API (:3000)
        ├── PostgreSQL   Prisma (users, products, orders)
        ├── Redis        product-list cache + carts
        └── Kafka        order.placed / order.status.changed
                    ▲
                    └── KafkaJS consumer in the same Nest process
```

**Source of truth**

| Data | Where | Why |
|------|--------|-----|
| Users, products, orders, history | PostgreSQL | Durable, relational, transactional checkout |
| Shopping cart | Redis key `cart:{userId}` | Ephemeral; discarded after checkout |
| Product list responses | Redis keys `products:list:*` | Short TTL cache (60s) to avoid repeating the same list query |
| Order notifications | Kafka topics | Decouple “save the order” from “notify / email” |

---

## Tech stack and how it is used

### Backend (`server/`)

| Technology | Role in EventCart |
|------------|-------------------|
| **NestJS 11** | HTTP API: modules for `auth`, `users`, `products`, `orders`, `cart`, `events`, `redis`, `prisma`. Controllers expose REST; Swagger documents them in development. |
| **TypeScript** | Shared types from Prisma-generated client and DTOs validated with `class-validator`. |
| **Prisma 7 + `@prisma/adapter-pg`** | ORM against PostgreSQL. Schema in `server/prisma/schema.prisma`. Migrations via `prisma migrate`. Client generated to `server/src/generated/prisma`. |
| **PostgreSQL** | Persistent store. `cuid()` IDs, unique email/slug/orderNumber, decimal money (`Decimal(10,2)`). |
| **Passport JWT + `@nestjs/jwt`** | Login/register return an access token. `JwtAuthGuard` protects private routes. `RolesGuard` + `@Roles(ADMIN)` gates admin work. |
| **bcrypt** | Password hashing; `passwordHash` is never serialized in API responses. |
| **ioredis** | `RedisService` wraps get/set/del. Used by `ProductsService` (list cache + invalidation on writes) and `CartService` (JSON cart). |
| **KafkaJS** | `KafkaProducerService` publishes after DB commit. `KafkaConsumerService` subscribes and logs simulated emails. Topics are created at startup if missing. |
| **Helmet** | HTTP security headers. |
| **@nestjs/throttler** | Global rate limit; login/register tightened to 5 requests / minute. |
| **OpenAPI (`@nestjs/swagger`)** | Interactive docs at `/api` — **disabled when `NODE_ENV=production`**. |
| **GraphQL (Apollo)** | Starter health query only (`{ health }`). Domain APIs are REST, not GraphQL. GraphiQL/introspection off in production. |

### Frontend (`client/`)

| Technology | Role in EventCart |
|------------|-------------------|
| **React 19** | UI for shop, cart, orders, admin. |
| **Vite 8** | Dev server and production bundler (`npm run dev` → port 5173). |
| **Tailwind CSS v4** (`@tailwindcss/vite`) | Utility styling; tokens in `src/index.css` (`@theme`). |
| **React Router 7** | Routes: catalog, product detail, login/register, cart, orders, admin. |
| **TanStack Query** | Fetches products/cart/orders; invalidates after cart/checkout/admin updates. |
| **Axios** | `src/lib/api.ts` — `baseURL` from `VITE_API_URL`, attaches JWT from `localStorage`. |

### Infra

| Service | Default | Used for |
|---------|---------|----------|
| PostgreSQL | `5432` | Prisma `DATABASE_URL` |
| Redis | `6379` | Cache + cart |
| Kafka (KRaft) | `9092` | Order events |

Run everything with **Docker Compose** (see below) or install Postgres/Redis/Kafka locally.

---

## Domain model

Defined in Prisma (`server/prisma/schema.prisma`):

| Entity | Purpose |
|--------|---------|
| **User** | `CUSTOMER` or `ADMIN`. Email unique. |
| **Product** | Catalog row; `isActive` is a soft-delete flag. |
| **Order** | Header: `orderNumber` (`EC-YYYYMMDD-XXXX`), `status`, `subtotal`, `total`, `userId`. |
| **OrderItem** | Snapshot of quantity, unit price, line total (price frozen at checkout). Unique per `(orderId, productId)`. |
| **OrderStatusHistory** | Append-only audit of status changes (who/when/note). |

**Order status:** `PENDING` → `CONFIRMED` → `PREPARING` → `SHIPPED` → `DELIVERED`, or `CANCELLED` (restores stock). Admins set status via `PATCH /orders/:id/status`; Kafka does not choose the next status.

---

## How key flows work

### Authentication

1. `POST /auth/register` always creates a **CUSTOMER** (hash password, return JWT).
2. `POST /auth/login` verifies bcrypt, returns JWT (`sub`, `email`, `role`).
3. Client stores the token and sends `Authorization: Bearer …`.
4. `GET /auth/me` reloads the current user.

Admins are not created by register. Promote in SQL or use `npm run seed:api`, which upserts `admin@test.com` as `ADMIN`.

### Product list cache (Redis)

1. `GET /products?page&limit&isActive&search` builds a cache key from those params.
2. **Miss** → query Postgres → store JSON in Redis for 60 seconds.
3. **Hit** → return Redis JSON (Nest logs `Cache hit` / `Cache miss` at debug).
4. Product create/update/deactivate deletes `products:list:*` so the next list is fresh.

### Cart and checkout

1. Authenticated `POST /cart/items` writes `{ productId, quantity }[]` to `cart:{userId}`.
2. `GET /cart` hydrates prices/names from Postgres.
3. `POST /cart/checkout` calls `OrdersService.create`, then **deletes** the Redis cart.
4. Alternatively, `POST /orders` with `{ items: [{ productId, quantity }] }` skips the cart.

Checkout runs in a **Prisma transaction**: create order + items + first history row (`PENDING`), decrement stock. Then Kafka `order.placed` is published asynchronously (HTTP does not wait on the broker).

### Kafka

| Topic | When | Payload (simplified) |
|-------|------|----------------------|
| `order.placed` | After successful checkout | `orderId`, `orderNumber`, `userId`, `total`, `items` |
| `order.status.changed` | After admin status PATCH | `previousStatus`, `newStatus`, `changedById` |

Message key is `orderId` so updates for one order stay ordered on a partition. The in-process consumer currently **logs** a fake confirmation email / status notification.

---

## Repository layout

```
eventcart/
├── client/                 React + Vite shop
│   └── src/
│       ├── pages/          Shop, cart, orders, admin
│       ├── hooks/          useAuth
│       ├── lib/api.ts      Axios + JWT
│       └── types/
├── server/                 NestJS API
│   ├── prisma/             schema, migrations, seed.ts
│   ├── scripts/seed-api.ts Load test users/products/orders via HTTP
│   └── src/
│       ├── auth/           JWT login/register
│       ├── users/
│       ├── products/       CRUD + Redis list cache
│       ├── cart/           Redis cart
│       ├── orders/         Transactions + Kafka publish
│       ├── events/         Kafka producer/consumer
│       ├── redis/
│       ├── prisma/
│       └── common/         Guards, filters, rate-limit helpers
├── docker-compose.yml      Full stack (Postgres, Redis, Kafka, API, client)
├── .env.example            Compose env template (copy to `.env` at repo root)
├── README.md
└── steps.md
```

---

## HTTP API (REST)

Base URL: `http://localhost:3000`

| Area | Auth | Notes |
|------|------|--------|
| `POST /auth/register`, `POST /auth/login` | Public (throttled) | Returns `{ accessToken, user }` |
| `GET /auth/me` | JWT | |
| `GET /products`, `GET /products/:id`, `GET /products/slug/:slug` | Public | Cached list |
| `POST/PATCH/DELETE /products` | **Admin JWT** | |
| `GET/POST/PATCH/DELETE /cart…`, `POST /cart/checkout` | JWT | |
| `POST /orders`, `GET /orders`, `GET /orders/:id` | JWT | Customers see own orders |
| `PATCH /orders/:id/status` | **Admin JWT** | |
| `POST/GET /users`, `PATCH /users/:id` | JWT / admin | List/create is admin |

Dev Swagger: `http://localhost:3000/api` (not served in production).

---

## Frontend routes

| Path | Who |
|------|-----|
| `/`, `/products/:slug` | Anyone (add-to-cart needs login) |
| `/login`, `/register` | Guests |
| `/cart`, `/orders`, `/orders/:id` | Logged-in users |
| `/admin/products`, `/admin/orders` | `ADMIN` only |

---

## Docker (full stack)

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose).

Stop any local Postgres, Redis, Kafka, or Nest dev server on the same ports (`5432`, `6379`, `9092`, `3000`) before starting Compose.

```bash
# From repo root
cp .env.example .env
# Edit JWT_SECRET in .env (≥ 32 characters)

docker compose up --build
```

| URL | Service |
|-----|---------|
| http://localhost:5173 | Shop (nginx + static React build) |
| http://localhost:3000 | Nest API |
| http://localhost:3000/api | Swagger (when `NODE_ENV` is not `production`) |

On first boot the API container runs `prisma db push` and seeds products when `SEED_ON_START=true` (default). To load test users and sample orders, run the API seeder against the running stack:

```bash
cd server
npm install
npm run seed:api
```

Use the same test accounts as local dev (`customer@test.com` / `admin@test.com`, password `TestPass123`). The seeder upserts users via Prisma, then creates products/orders over HTTP.

```bash
docker compose down      # stop containers
docker compose down -v   # stop and wipe Postgres volume
```

---

## Local setup (without Docker)

**Prerequisites:** Node.js **20 or 22 LTS** (KafkaJS is unreliable on Node 25), PostgreSQL, Redis, Kafka 4.x on port `9092`.

### 1. Database

```sql
CREATE DATABASE eventcart;
```

### 2. API

```bash
cd server
cp .env.example .env
# Edit DATABASE_URL, JWT_SECRET (≥ 32 chars), REDIS_URL, KAFKA_BROKERS
npm install
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

Start Kafka **before** Nest so the producer can connect and create topics.

### 3. Client

```bash
cd client
npm install
npm run dev
```

`client/.env` should contain `VITE_API_URL=http://localhost:3000`. Nest CORS defaults to `http://localhost:5173` (`CORS_ORIGIN`).

### 4. Optional API seeder (needs running API + Kafka)

```bash
cd server
npm run seed:api
```

| Account | Password | Role |
|---------|----------|------|
| `customer@test.com` | `TestPass123` | CUSTOMER |
| `admin@test.com` | `TestPass123` | ADMIN |

### Environment (server)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signing key, **≥ 32 characters** |
| `JWT_EXPIRES_IN` | e.g. `1h` |
| `REDIS_URL` | e.g. `redis://localhost:6379` |
| `KAFKA_BROKERS` | e.g. `localhost:9092` |
| `KAFKA_CLIENT_ID` / `KAFKA_GROUP_ID` | KafkaJS client and consumer group |
| `CORS_ORIGIN` | Comma-separated browser origins |
| `PORT` | API port (default `3000`) |
| `NODE_ENV` | `production` turns off Swagger/GraphiQL and hides error stacks |

Do not commit `.env`. Copy from `server/.env.example`.

---

## Tests

```bash
cd server
npm test          # unit (e.g. OrdersService stock/totals)
npm run test:e2e  # HTTP: public health, admin product guard, register → order
```

---

## Security (current)

- Admin-only catalog writes and order status updates  
- JWT required for cart, orders, and identity  
- bcrypt passwords; hash never in JSON  
- Rate limits on auth; Helmet; CORS allowlist  
- Validation whitelist + reject unknown fields  
- Request IDs (`x-request-id`); production errors do not include stack traces  
- JWT stored in **localStorage** (simple for this project; XSS can steal it — httpOnly cookies would be stricter)

---

## Optional next steps

- httpOnly cookie auth instead of localStorage JWT
- Stricter order status state machine
- `docker-compose.dev.yml` — infra only (Postgres/Redis/Kafka) while running Nest/Vite on the host with hot reload
