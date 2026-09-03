# EventCart — Next Steps

**Done:** NestJS APIs, JWT, Redis, Kafka, React + Vite + Tailwind shop UI.

---

## Phase 8 — Polish

1. Unit tests (`OrdersService`) + E2E (register → order)
2. Logging, global exception filter
3. Protect product write routes with `@Roles(ADMIN)`
4. `prisma/seed.ts` for sample products
5. README with local setup instructions

---

## Phase 9 — Docker (last)

1. `docker-compose.yml` — postgres, redis, kafka, server, client
2. Dockerfiles for `server/` and `client/`
3. `docker compose up --build` runs the full stack
