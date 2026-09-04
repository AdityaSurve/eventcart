# EventCart

EventCart is a full-stack **event merchandise shop**: customers browse a categorized catalog, hold a cart (signed-in or guest), apply coupons, check out with a demo or Stripe payment, track fulfillment in realtime, leave reviews, and download PDF receipts. Admins manage catalog, coupons, order status, low-stock alerts, and analytics.

Two apps talk over REST (cookie session in the browser; Bearer still works for scripts):

| App | Path | Runtime |
|-----|------|---------|
| API | `server/` | NestJS on `http://localhost:3000` |
| Shop UI | `client/` | React + Vite on `http://localhost:5173` |

---

## What the system does

1. **Catalog** — products with name, slug, price, stock, optional category and image in PostgreSQL. Public list supports search, category, price range, and sort.
2. **Accounts** — email/password, optional Google OAuth, and WebAuthn passkeys (Windows Hello / Touch ID). Admins have extra routes.
3. **Cart** — pre-checkout items live in Redis (`cart:user:{id}` or `cart:guest:{guestId}`). Guests send `X-Guest-Id`; login merges guest cart into the user cart.
4. **Coupons** — percent or fixed codes; apply on cart; re-validated and redeemed at pay time.
5. **Checkout / payments** — demo checkout (no card) or optional Stripe Checkout. Orders store subtotal, discount, total, payment fields, and optional guest name/email.
6. **Fulfillment** — admins move status (`PENDING` → `CONFIRMED` → … or `CANCELLED`). Customers can cancel pending/confirmed orders. Changes append to `OrderStatusHistory` and emit Socket.IO updates.
7. **Wishlist & reviews** — signed-in users save favorites and leave one rating (1–5) + optional text per product.
8. **Receipts** — `GET /orders/:id/receipt.pdf` (owner, admin, or matching `guestEmail`).
9. **Low-stock alerts** — admin list/banner when stock ≤ `LOW_STOCK_THRESHOLD` (default 10).
10. **Async side effects** — Kafka `order.placed` / `order.status.changed`; consumer logs a simulated notification.
11. **Admin analytics** — KPIs, charts, and a lightweight OLS demand/revenue forecast (`GET /analytics`).

---

## Architecture

```
Browser (React + Vite :5173)
        │  REST + httpOnly cookie (credentials)
        │  X-Guest-Id for anonymous cart
        │  Socket.IO (order.updated)
        ▼
NestJS API (:3000)
        ├── PostgreSQL   Prisma (users, catalog, coupons, wishlist, reviews, orders)
        ├── Redis        product-list cache + carts + WebAuthn challenges + Stripe session stash
        └── Kafka        order.placed / order.status.changed
                    ▲
                    └── KafkaJS consumer in the same Nest process
```

**Source of truth**

| Data | Where | Why |
|------|--------|-----|
| Users, products, categories, coupons, wishlist, reviews, orders, history, passkeys | PostgreSQL | Durable, relational, transactional checkout |
| Shopping cart (+ optional coupon code) | Redis `cart:user:{id}` / `cart:guest:{id}` | Ephemeral; cleared after pay |
| Product list responses | Redis `products:list:*` | Short TTL cache (60s) |
| WebAuthn challenges | Redis (`webauthn:reg:*`, `webauthn:login:*`) | Short-lived ceremony state |
| Stripe checkout stash | Redis `stripe:session:{id}` | Bridge success redirect → order create |
| Order notifications | Kafka topics | Decouple “save the order” from “notify / email” |
| Live order UI | Socket.IO rooms `user:{id}` / `admins` | Invalidate React Query on status/payment change |
| Session | httpOnly cookie `eventcart_access` | JWT not readable by JS in the browser |

---

## Tech stack and how it is used

### Backend (`server/`)

| Technology | Role in EventCart |
|------------|-------------------|
| **NestJS 11** | HTTP API: auth, users, products, categories, coupons, cart, orders, payments, wishlist, reviews, analytics, events, redis, prisma. Swagger in development. |
| **TypeScript** | Prisma-generated client + DTOs with `class-validator`. |
| **Prisma 7 + `@prisma/adapter-pg`** | ORM. Schema in `server/prisma/schema.prisma`. Client → `server/src/generated/prisma`. |
| **PostgreSQL** | Persistent store. |
| **Passport JWT + `@nestjs/jwt`** | Cookie first, then `Authorization: Bearer`. Optional JWT guard for guest cart/checkout. |
| **passport-google-oauth20** | Optional Google sign-in. |
| **@simplewebauthn/server** | Passkey registration and login. |
| **bcrypt** | Password hashing. |
| **ioredis** | Cache, cart, challenges, Stripe session stash. |
| **KafkaJS** | Order events after DB commit. |
| **Socket.IO (`@nestjs/websockets`)** | Realtime `order.updated` to clients. |
| **pdfkit** | Order receipt PDFs. |
| **stripe** | Optional Checkout Sessions when `STRIPE_SECRET_KEY` is set. |
| **Helmet + cookie-parser** | Security headers and httpOnly cookies. |
| **@nestjs/throttler** | Global rate limit; auth routes tightened. |
| **OpenAPI (`@nestjs/swagger`)** | `/api` — off when `NODE_ENV=production`. |
| **GraphQL (Apollo)** | Starter `{ health }` only; domain APIs are REST. |

### Frontend (`client/`)

| Technology | Role in EventCart |
|------------|-------------------|
| **React 19** | Shop, cart (guest + auth), orders, wishlist, account, admin. |
| **Vite 8** | Dev server / production bundler (`npm run dev` → 5173). |
| **Tailwind CSS v4** | Utility styling; tokens in `src/index.css`. |
| **React Router 7** | Catalog, cart, auth, wishlist, admin analytics/products/orders/coupons. |
| **TanStack Query** | Fetches + invalidation; Socket.IO triggers order refetch. |
| **Axios** | `withCredentials` + `X-Guest-Id` interceptor. |
| **@simplewebauthn/browser** | Passkey ceremonies. |
| **socket.io-client** | Live order status. |
| **react-icons** | UI icons. |
| **Recharts** | Admin analytics charts. |

### Infra

| Service | Default | Used for |
|---------|---------|----------|
| PostgreSQL | `5432` | Prisma `DATABASE_URL` |
| Redis | `6379` | Cache + cart + WebAuthn + Stripe stash |
| Kafka (KRaft) | `9092` | Order events |

Run everything with **Docker Compose** (below) or install Postgres/Redis/Kafka locally.

---

## Domain model

Defined in Prisma (`server/prisma/schema.prisma`):

| Entity | Purpose |
|--------|---------|
| **User** | `CUSTOMER` or `ADMIN`. Optional `passwordHash` / `googleId`. |
| **WebAuthnCredential** | Registered passkey. |
| **Category** | Catalog grouping (`name`, unique `slug`). |
| **Product** | Catalog row; optional `categoryId`, `imageUrl`; `isActive` soft-delete. |
| **Coupon** | `PERCENT` or `FIXED`; `code`, `value`, optional min/max uses/expiry. |
| **WishlistItem** | Unique `(userId, productId)`. |
| **Review** | Unique `(userId, productId)`; rating 1–5 + optional body. |
| **Order** | `orderNumber`, status, payment fields, `subtotal` / `discount` / `total`, optional `userId` or `guestEmail`/`guestName`, optional `couponCode`. |
| **OrderItem** | Quantity + frozen unit/line prices. |
| **OrderStatusHistory** | Append-only status audit. |

**Order status:** `PENDING` → `CONFIRMED` → `PREPARING` → `SHIPPED` → `DELIVERED`, or `CANCELLED` (restores stock).

**Payment status:** `UNPAID` → `PAID` (demo/Stripe) / `FAILED` / `REFUNDED`.

---

## How key flows work

### Authentication

1. `POST /auth/register` / `POST /auth/login` set httpOnly cookie `eventcart_access` and may return `{ accessToken, user }` for scripts.
2. Browser Axios uses `withCredentials`; no JWT in `localStorage`.
3. `GET /auth/me` / `POST /auth/logout` for session reload and clear.
4. **Google** — `GET /auth/google` → callback → cookie → `FRONTEND_URL/auth/callback`.
5. **Passkeys** — Account registers device; login page can use WebAuthn. Challenges in Redis.
6. After login/register, client calls `POST /cart/merge` so guest Redis cart lands on the user.

Admins are not created by register. Use `npm run seed:api` (`admin@test.com`) or promote in SQL.

### Product list cache (Redis)

1. `GET /products` with `page`, `limit`, `isActive`, `search`, `categoryId` / `categorySlug`, `minPrice` / `maxPrice`, `sort`.
2. Cache key includes those params; TTL 60s; invalidated on product/category writes.

### Cart, coupons, and checkout

1. Cart owner = JWT user **or** `X-Guest-Id` header (CORS allows this header).
2. Items + optional `couponCode` stored in Redis; `GET /cart` returns subtotal, discount, total.
3. **Pay path (UI):** `POST /payments/demo/checkout` or Stripe session — creates order, marks paid, clears cart, redeems coupon.
4. Guests must send `guestName` + `guestEmail` on pay.
5. `POST /cart/checkout` still creates an unpaid order (scripts/tests); UI prefers payments.

Checkout runs in a **Prisma transaction** (stock decrement), then Kafka `order.placed` and (after pay) Socket.IO `order.updated`.

### Payments

| Method | When | Behavior |
|--------|------|----------|
| Demo | Always | Instant `PAID` / `DEMO`; no card |
| Stripe | `STRIPE_SECRET_KEY` set | Checkout Session → success URL creates order + `PAID` / `STRIPE` |

See `steps.md` for Stripe test keys.

### Kafka

| Topic | When |
|-------|------|
| `order.placed` | After successful order create |
| `order.status.changed` | After status PATCH / cancel |

### Admin analytics / low stock

- `GET /analytics` — KPIs, charts, OLS demand labels (`hot` / `steady` / `cooling`).
- `GET /products/low-stock` — active products with `stock <= LOW_STOCK_THRESHOLD`.

---

## Repository layout

```
eventcart/
├── client/                 React + Vite shop
│   └── src/
│       ├── pages/          Shop, cart, orders, wishlist, account, admin
│       ├── hooks/          useAuth, useOrderRealtime
│       ├── lib/api.ts      Axios + credentials + X-Guest-Id
│       └── types/
├── server/                 NestJS API
│   ├── prisma/             schema, seed.ts, SQL helpers
│   ├── scripts/            seed-api.ts, seed-docker.cjs
│   └── src/
│       ├── auth/           Cookie JWT, Google, WebAuthn
│       ├── products/       CRUD, filters, low-stock, Redis cache
│       ├── categories/
│       ├── coupons/
│       ├── cart/           Guest + user Redis cart, coupons
│       ├── orders/         Transactions, PDF, Socket.IO gateway
│       ├── payments/       Demo + Stripe
│       ├── wishlist/
│       ├── reviews/
│       ├── analytics/
│       ├── events/         Kafka
│       └── common/         Guards (incl. optional JWT), CORS, filters
├── docker-compose.yml
├── .env.example
├── steps.md                Stripe setup notes
└── README.md
```

---

## HTTP API (REST)

Base URL: `http://localhost:3000`

| Area | Auth | Notes |
|------|------|--------|
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` | Public (auth throttled) | httpOnly cookie |
| `GET /auth/me` | Cookie or Bearer | |
| `GET /auth/google`, callback | Public | Needs Google env |
| `POST /auth/webauthn/*` | Mixed | Register (auth) / login (public) |
| `GET /categories` | Public | Admin `POST/PATCH/DELETE` |
| `GET /products` | Public | Filters + sort; cached |
| `GET /products/low-stock` | **Admin** | |
| `GET /products/slug/:slug`, `GET /products/:id` | Public | Includes avg rating |
| `POST/PATCH/DELETE /products` | **Admin** | |
| `GET/POST/… /cart…` | Cookie **or** `X-Guest-Id` | Coupon apply/remove, merge |
| `GET /payments/methods` | Public | `{ demo, stripe }` |
| `POST /payments/demo/checkout` | Cookie or guest | Body may include guest name/email |
| `POST /payments/stripe/checkout-session` | Cookie or guest | |
| `POST /coupons/validate` | Public | Preview discount |
| `GET/POST/PATCH/DELETE /coupons` | **Admin** | |
| `GET/POST/DELETE /wishlist…` | Cookie/Bearer | |
| `GET/POST /products/:id/reviews`, `DELETE /reviews/:id` | Public read; write auth | |
| `GET /orders`, `POST /orders` | Cookie/Bearer | List = own (or all admin) |
| `GET /orders/:id`, `GET /orders/:id/receipt.pdf` | Owner, admin, or `?guestEmail=` | |
| `PATCH /orders/:id/status` | **Admin** | |
| `POST /orders/:id/cancel` | Owner | Pending/confirmed |
| `GET /analytics` | **Admin** | |

Dev Swagger: `http://localhost:3000/api` (not in production).

---

## Frontend routes

| Path | Who |
|------|-----|
| `/`, `/products/:slug` | Anyone (add to cart works as guest) |
| `/cart` | Anyone (guest or signed-in) |
| `/orders/:id` | Owner / admin / guest with email query |
| `/login`, `/register`, `/auth/callback` | Guests |
| `/account`, `/wishlist`, `/orders` | Logged-in |
| `/admin/analytics`, `/admin/products`, `/admin/orders`, `/admin/coupons` | `ADMIN` |

Seed coupons for demos: **`WELCOME10`** (10% off, min $20) and **`SAVE5`** ($5 off, min $15).

---

## Docker (full stack)

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose).

Stop local processes on `5432`, `6379`, `9092`, `3000` before starting Compose.

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
| http://localhost:3000/api | Swagger (when not `production`) |

On first boot the API runs `prisma db push` and seeds categories, products, and sample coupons when `SEED_ON_START=true` (default). Test users are **not** in the Docker product seed — create them with:

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

Optional SQL helpers under `server/prisma/sql/` if you prefer raw migrations over `db push`.

Start Kafka **before** Nest so the producer can connect and create topics.

### 3. Client

```bash
cd client
npm install
npm run dev
```

`client/.env`: `VITE_API_URL=http://localhost:3000`. Nest CORS must allow `http://localhost:5173` with credentials and headers including `X-Guest-Id`.

### 4. Optional API seeder (needs running API + Kafka)

```bash
cd server
npm run seed:api
```

### 5. Optional Google OAuth

1. Create a Web OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Authorized redirect URI: `http://localhost:3000/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` in root `.env` (Compose) and/or `server/.env`.
4. Keep `FRONTEND_URL=http://localhost:5173`.

### 6. Passkeys (WebAuthn)

- `WEBAUTHN_RP_ID=localhost`
- `WEBAUTHN_ORIGIN=http://localhost:5173`

Sign in with password → **Account** → register this device → **Sign in with passkey** on login.

### 7. Optional Stripe

Set `STRIPE_SECRET_KEY` (test mode) and `API_PUBLIC_URL=http://localhost:3000`. Details in `steps.md`.

### Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signing key, **≥ 32 characters** |
| `JWT_EXPIRES_IN` | e.g. `1h` |
| `REDIS_URL` | e.g. `redis://localhost:6379` |
| `KAFKA_BROKERS` | e.g. `localhost:9092` |
| `KAFKA_CLIENT_ID` / `KAFKA_GROUP_ID` | KafkaJS ids |
| `CORS_ORIGIN` | Comma-separated browser origins |
| `FRONTEND_URL` | Shop URL (OAuth / Stripe cancel redirects) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Optional Google |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | Passkeys |
| `STRIPE_SECRET_KEY` | Optional Stripe Checkout |
| `API_PUBLIC_URL` | Public API URL for Stripe success return |
| `LOW_STOCK_THRESHOLD` | Admin alert threshold (default `10`) |
| `SEED_ON_START` | Docker: run product/category/coupon seed |
| `PORT` / `NODE_ENV` | API port; `production` hides Swagger stacks |

Do not commit `.env`. Use root `.env.example` for Compose and `server/.env.example` for local Nest.

---

## Tests

```bash
cd server
npm test          # unit (OrdersService, forecast helpers, …)
npm run test:e2e  # HTTP: health, admin guard, register → order
```

---

## Security (current)

- Admin-only catalog writes, coupons CRUD, order status, analytics, low-stock  
- Session via **httpOnly** cookie `eventcart_access`; Bearer for scripts  
- Guest cart via `X-Guest-Id` (allowed in CORS); guest order access via matching email  
- Optional Google OAuth; WebAuthn without a paid biometric SaaS  
- bcrypt passwords; Google-only users may have no password  
- Rate limits on auth; Helmet; CORS allowlist with credentials  
- Validation whitelist + reject unknown fields  
- Request IDs (`x-request-id`); production errors omit stacks  

---

## Optional next steps

- Stricter order status state machine  
- `docker-compose.dev.yml` — infra only while Nest/Vite run on the host  
- Stripe webhooks for production-style payment confirmation  
- Real email/SMS from the Kafka consumer  
