# EventCart

EventCart is a full-stack **event merchandise shop**: customers browse products, hold a cart, check out into orders, and track fulfillment. Admins manage catalog, order status, and analytics.

It is built as two apps that talk over REST (cookie session in the browser; Bearer still works for scripts):

| App | Path | Runtime |
|-----|------|---------|
| API | `server/` | NestJS on `http://localhost:3000` |
| Shop UI | `client/` | React + Vite on `http://localhost:5173` |

---

## What the system does

1. **Catalog** — products with name, slug, price, and stock in PostgreSQL.
2. **Accounts** — email/password, optional Google OAuth, and WebAuthn passkeys (Windows Hello / Touch ID). Admins have extra routes.
3. **Cart** — pre-checkout items live in Redis (not in the database).
4. **Checkout** — cart (or a direct order payload) becomes an `Order` with line items, totals, and stock decrements in a single transaction.
5. **Fulfillment** — admins move status (`PENDING` → `CONFIRMED` → … or `CANCELLED`). Each change is appended to `OrderStatusHistory`.
6. **Async side effects** — after an order is placed or its status changes, Nest publishes Kafka events. A consumer logs a simulated email/notification so the HTTP request does not wait on those jobs.
7. **Admin analytics** — KPIs, charts, and a lightweight OLS demand/revenue forecast (`GET /analytics`).

---

## Architecture

```
Browser (React + Vite :5173)
        │  REST + httpOnly cookie (credentials)
        │  (scripts may still use Authorization: Bearer)
        ▼
NestJS API (:3000)
        ├── PostgreSQL   Prisma (users, passkeys, products, orders)
        ├── Redis        product-list cache + carts + WebAuthn challenges
        └── Kafka        order.placed / order.status.changed
                    ▲
                    └── KafkaJS consumer in the same Nest process
```

**Source of truth**

| Data | Where | Why |
|------|--------|-----|
| Users, products, orders, history, passkeys | PostgreSQL | Durable, relational, transactional checkout |
| Shopping cart | Redis key `cart:{userId}` | Ephemeral; discarded after checkout |
| Product list responses | Redis keys `products:list:*` | Short TTL cache (60s) |
| WebAuthn challenges | Redis (`webauthn:reg:*`, `webauthn:login:*`) | Short-lived ceremony state |
| Order notifications | Kafka topics | Decouple “save the order” from “notify / email” |
| Session | httpOnly cookie `eventcart_access` | JWT not readable by JS in the browser |

---

## Tech stack and how it is used

### Backend (`server/`)

| Technology | Role in EventCart |
|------------|-------------------|
| **NestJS 11** | HTTP API: `auth`, `users`, `products`, `orders`, `cart`, `analytics`, `events`, `redis`, `prisma`. Swagger in development. |
| **TypeScript** | Shared types from Prisma-generated client and DTOs validated with `class-validator`. |
| **Prisma 7 + `@prisma/adapter-pg`** | ORM against PostgreSQL. Schema in `server/prisma/schema.prisma`. Client generated to `server/src/generated/prisma`. |
| **PostgreSQL** | Persistent store. Optional `passwordHash` / `googleId`; `WebAuthnCredential` for passkeys. |
| **Passport JWT + `@nestjs/jwt`** | Signs access tokens. Strategy reads **cookie first**, then `Authorization: Bearer`. |
| **passport-google-oauth20** | Optional Google sign-in (`GOOGLE_CLIENT_ID` / `SECRET`). |
| **@simplewebauthn/server** | Passkey registration and login (Windows Hello, Touch ID, security keys). |
| **bcrypt** | Password hashing; hash never appears in API JSON. |
| **ioredis** | Cache, cart, WebAuthn challenge storage. |
| **KafkaJS** | Publishes after DB commit; consumer logs simulated notifications. Topics created at startup if missing. |
| **Helmet + cookie-parser** | Security headers and httpOnly session cookies. |
| **@nestjs/throttler** | Global rate limit; auth routes tightened. |
| **OpenAPI (`@nestjs/swagger`)** | Docs at `/api` — **off when `NODE_ENV=production`**. |
| **GraphQL (Apollo)** | Starter health query only (`{ health }`). Domain APIs are REST. |

### Frontend (`client/`)

| Technology | Role in EventCart |
|------------|-------------------|
| **React 19** | Shop, cart, orders, account (passkeys), admin. |
| **Vite 8** | Dev server and production bundler (`npm run dev` → port 5173). |
| **Tailwind CSS v4** | Utility styling; tokens in `src/index.css`. |
| **React Router 7** | Catalog, auth, account, admin analytics/products/orders. |
| **TanStack Query** | Fetches products/cart/orders/analytics; invalidates after mutations. |
| **Axios** | `withCredentials: true` so the httpOnly cookie is sent cross-origin to the API. |
| **@simplewebauthn/browser** | Browser WebAuthn ceremonies for passkeys. |
| **Recharts** | Admin analytics charts. |

### Infra

| Service | Default | Used for |
|---------|---------|----------|
| PostgreSQL | `5432` | Prisma `DATABASE_URL` |
| Redis | `6379` | Cache + cart + WebAuthn challenges |
| Kafka (KRaft) | `9092` | Order events |

Run everything with **Docker Compose** (see below) or install Postgres/Redis/Kafka locally.

---

## Domain model

Defined in Prisma (`server/prisma/schema.prisma`):

| Entity | Purpose |
|--------|---------|
| **User** | `CUSTOMER` or `ADMIN`. Email unique. Optional `passwordHash` and `googleId`. |
| **WebAuthnCredential** | Registered passkey (credential id, public key, counter). |
| **Product** | Catalog row; `isActive` is a soft-delete flag. |
| **Order** | Header: `orderNumber` (`EC-YYYYMMDD-XXXX`), `status`, `subtotal`, `total`, `userId`. |
| **OrderItem** | Snapshot of quantity, unit price, line total (price frozen at checkout). |
| **OrderStatusHistory** | Append-only audit of status changes (who/when/note). |

**Order status:** `PENDING` → `CONFIRMED` → `PREPARING` → `SHIPPED` → `DELIVERED`, or `CANCELLED` (restores stock). Admins set status via `PATCH /orders/:id/status`.

---

## How key flows work

### Authentication

1. `POST /auth/register` creates a **CUSTOMER**, sets httpOnly cookie `eventcart_access`, and returns `{ accessToken, user }` (token still useful for scripts).
2. `POST /auth/login` verifies bcrypt (if the account has a password), same cookie behavior.
3. Browser Axios uses `withCredentials`; no JWT in `localStorage`.
4. `GET /auth/me` reloads the current user from the cookie (or Bearer).
5. `POST /auth/logout` clears the cookie.
6. **Google** — `GET /auth/google` → Google → `GET /auth/google/callback` → cookie → redirect to `FRONTEND_URL/auth/callback`. Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
7. **Passkeys** — after login, Account page registers a device (`/auth/webauthn/register/*`). Login page can sign in with email + WebAuthn (`/auth/webauthn/login/*`). Challenges live briefly in Redis.

Admins are not created by register. Promote in SQL or use `npm run seed:api` (`admin@test.com`).

### Product list cache (Redis)

1. `GET /products?page&limit&isActive&search` builds a cache key from those params.
2. **Miss** → query Postgres → store JSON in Redis for 60 seconds.
3. **Hit** → return Redis JSON.
4. Product create/update/deactivate deletes `products:list:*`.

### Cart and checkout

1. Authenticated `POST /cart/items` writes to `cart:{userId}`.
2. `GET /cart` hydrates prices/names from Postgres.
3. `POST /cart/checkout` creates an order, then **deletes** the Redis cart.
4. Alternatively, `POST /orders` with `{ items: [{ productId, quantity }] }` skips the cart.

Checkout runs in a **Prisma transaction**, then Kafka `order.placed` is published asynchronously.

### Kafka

| Topic | When | Payload (simplified) |
|-------|------|----------------------|
| `order.placed` | After successful checkout | `orderId`, `orderNumber`, `userId`, `total`, `items` |
| `order.status.changed` | After admin status PATCH | `previousStatus`, `newStatus`, `changedById` |

### Admin analytics / ML (lightweight)

`GET /analytics` (admin only) returns:

- KPIs (revenue, paid orders, average order, 14-day projected revenue)
- Revenue-by-day series and a 14-day projection
- Order status mix and top products
- Per-product **OLS** (ordinary least squares) units-per-day slope, demand labels (`hot` / `steady` / `cooling`), and projected units/revenue

This is a teaching-scale model (OLS + exponential smoothing), not a heavy ML stack.

---

## Repository layout

```
eventcart/
├── client/                 React + Vite shop
│   └── src/
│       ├── pages/          Shop, cart, orders, account, admin analytics
│       ├── hooks/          useAuth (cookie session)
│       ├── lib/api.ts      Axios + withCredentials
│       └── types/
├── server/                 NestJS API
│   ├── prisma/             schema, seed.ts, optional SQL helpers
│   ├── scripts/seed-api.ts Load test users/products/orders via HTTP
│   └── src/
│       ├── auth/           Cookie JWT, Google, WebAuthn
│       ├── analytics/      Admin KPIs + OLS forecast
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
| `POST /auth/register`, `POST /auth/login` | Public (throttled) | Sets **httpOnly** cookie; JSON may include `accessToken` for scripts |
| `POST /auth/logout` | Public | Clears cookie |
| `GET /auth/me` | Cookie or Bearer | Current user |
| `GET /auth/google`, `GET /auth/google/callback` | Public | Needs Google env vars |
| `POST /auth/webauthn/register/*` | Cookie/Bearer | Register passkey |
| `GET /auth/webauthn/credentials` | Cookie/Bearer | List passkeys |
| `POST /auth/webauthn/login/*` | Public (throttled) | Passkey login |
| `GET /analytics` | **Admin** | Charts + demand forecast |
| `GET /products`, `GET /products/:id`, `GET /products/slug/:slug` | Public | Cached list |
| `POST/PATCH/DELETE /products` | **Admin** | |
| `GET/POST/PATCH/DELETE /cart…`, `POST /cart/checkout` | Cookie/Bearer | |
| `POST /orders`, `GET /orders`, `GET /orders/:id` | Cookie/Bearer | Customers see own orders |
| `PATCH /orders/:id/status` | **Admin** | |
| `POST/GET /users`, `PATCH /users/:id` | Cookie/Bearer / admin | List/create is admin |

Dev Swagger: `http://localhost:3000/api` (not served in production).

---

## Frontend routes

| Path | Who |
|------|-----|
| `/`, `/products/:slug` | Anyone (add-to-cart needs login) |
| `/login`, `/register` | Guests (password, Google, passkey login) |
| `/auth/callback` | After Google OAuth redirect |
| `/account` | Logged-in users (register passkeys) |
| `/cart`, `/orders`, `/orders/:id` | Logged-in users |
| `/admin/analytics` | `ADMIN` — charts and demand model |
| `/admin/products`, `/admin/orders` | `ADMIN` |

---

## Docker (full stack)

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose).

Stop any local Postgres, Redis, Kafka, or Nest process on the same ports (`5432`, `6379`, `9092`, `3000`) before starting Compose.

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

On first boot the API container runs `prisma db push` and seeds products when `SEED_ON_START=true` (default). To load test users and sample orders:

```bash
cd server
npm install
npm run seed:api
```

| Account | Password | Role |
|---------|----------|------|
| `customer@test.com` | `TestPass123` | CUSTOMER |
| `admin@test.com` | `TestPass123` | ADMIN |

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
npx prisma db push
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

`client/.env` should contain `VITE_API_URL=http://localhost:3000`. Nest CORS must allow `http://localhost:5173` with credentials (`CORS_ORIGIN`).

### 4. Optional API seeder (needs running API + Kafka)

```bash
cd server
npm run seed:api
```

### 5. Optional Google OAuth

1. Create a Web OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Authorized redirect URI: `http://localhost:3000/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` in `server/.env`.
4. Keep `FRONTEND_URL=http://localhost:5173`.

### 6. Passkeys (WebAuthn)

Uses the free browser WebAuthn API (no paid biometric vendor). For local learning:

- `WEBAUTHN_RP_ID=localhost`
- `WEBAUTHN_ORIGIN=http://localhost:5173`

Sign in with password, open **Account**, register this device, then use **Sign in with passkey** on the login page.

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
| `FRONTEND_URL` | Redirect after Google OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional Google login |
| `GOOGLE_CALLBACK_URL` | e.g. `http://localhost:3000/auth/google/callback` |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | Passkeys (`localhost` / `http://localhost:5173`) |
| `PORT` | API port (default `3000`) |
| `NODE_ENV` | `production` turns off Swagger/GraphiQL and hides error stacks |

Do not commit `.env`. Copy from `server/.env.example` (or root `.env.example` for Compose).

---

## Tests

```bash
cd server
npm test          # unit (OrdersService, OLS forecast helpers, …)
npm run test:e2e  # HTTP: public health, admin product guard, register → order
```

---

## Security (current)

- Admin-only catalog writes, order status updates, and analytics  
- Session via **httpOnly** cookie `eventcart_access` (browser); Bearer still accepted for scripts  
- Optional Google OAuth; WebAuthn passkeys without a paid biometric SaaS  
- bcrypt passwords; hash never in JSON; Google-only users may have no password  
- Rate limits on auth; Helmet; CORS allowlist with credentials  
- Validation whitelist + reject unknown fields  
- Request IDs (`x-request-id`); production errors do not include stack traces  

---

## Optional next steps

- Stricter order status state machine  
- `docker-compose.dev.yml` — infra only (Postgres/Redis/Kafka) while Nest/Vite run on the host with hot reload  
