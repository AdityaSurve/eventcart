/**
 * Seeds test data via the running Nest API.
 *
 * Prerequisites:
 *   - Server running: npm run start:dev
 *   - Postgres + Redis up
 *   - DATABASE_URL in .env (used to ensure test users exist with known password)
 *
 * Usage:
 *   npm run seed:api
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient, Role } from '../src/generated/prisma/client';

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';
const PRODUCT_COUNT = Number(process.env.SEED_PRODUCT_COUNT ?? 100);
const ORDER_COUNT = Number(process.env.SEED_ORDER_COUNT ?? 6);
const PASSWORD = 'TestPass123';

const CUSTOMER = {
  name: 'Test Customer',
  email: 'customer@test.com',
};

const ADMIN = {
  name: 'Test Admin',
  email: 'admin@test.com',
};

type AuthResponse = {
  accessToken: string;
  user: { id: string; email: string; role: string };
};

type ProductResponse = {
  id: string;
  slug: string;
};

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} → ${response.status}: ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function ensureUser(
  user: { name: string; email: string },
  role: Role,
): Promise<AuthResponse> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const email = user.email.toLowerCase();

  await prisma.user.upsert({
    where: { email },
    update: { name: user.name, passwordHash, role },
    create: { name: user.name, email, passwordHash, role },
  });

  await prisma.$disconnect();

  console.log(`  ↳ Ensured ${email} (${role})`);

  return api<AuthResponse>('POST', '/auth/login', {
    email: user.email,
    password: PASSWORD,
  });
}

async function seedProducts(): Promise<string[]> {
  const productIds: string[] = [];
  let created = 0;
  let skipped = 0;

  for (let i = 1; i <= PRODUCT_COUNT; i++) {
    const slug = `seed-product-${String(i).padStart(3, '0')}`;

    try {
      const product = await api<ProductResponse>('POST', '/products', {
        name: `Seed Product ${i}`,
        slug,
        description: `Auto-generated test product #${i}`,
        price: Number((5 + (i % 50) + Math.random()).toFixed(2)),
        stock: 50 + (i % 100),
      });

      productIds.push(product.id);
      created++;
    } catch (error) {
      if (error instanceof Error && error.message.includes('409')) {
        skipped++;
        continue;
      }
      throw error;
    }

    if (i % 25 === 0) {
      console.log(`  … ${i}/${PRODUCT_COUNT} products processed`);
    }
  }

  if (productIds.length === 0) {
    console.log('  ↳ No new products created, fetching existing slugs from API...');
    const list = await api<{ items: ProductResponse[] }>(
      'GET',
      `/products?limit=${PRODUCT_COUNT}`,
    );
    return list.items.map((p) => p.id);
  }

  console.log(`  ✓ Products: ${created} created, ${skipped} skipped`);
  return productIds;
}

async function seedOrders(customerToken: string, productIds: string[]) {
  if (!productIds.length) {
    throw new Error('No product IDs available for orders');
  }

  for (let i = 1; i <= ORDER_COUNT; i++) {
    const itemCount = 1 + (i % 3);
    const items = Array.from({ length: itemCount }, (_, index) => ({
      productId: productIds[(i + index) % productIds.length],
      quantity: 1 + (i % 4),
    }));

    await api('POST', '/orders', { items }, customerToken);
    console.log(`  ✓ Order ${i}/${ORDER_COUNT} placed`);
  }
}

async function main() {
  console.log(`\nEventCart API seeder → ${BASE_URL}\n`);

  console.log('1/4 Ensuring test users...');
  const customerAuth = await ensureUser(CUSTOMER, Role.CUSTOMER);
  console.log(`  ✓ Customer: ${customerAuth.user.email}`);

  const adminAuth = await ensureUser(ADMIN, Role.ADMIN);
  console.log(`  ✓ Admin: ${adminAuth.user.email}`);

  console.log(`\n2/4 Creating ${PRODUCT_COUNT} products...`);
  const productIds = await seedProducts();

  console.log(`\n3/4 Placing ${ORDER_COUNT} orders as customer...`);
  await seedOrders(customerAuth.accessToken, productIds);

  console.log('\n4/4 Done!\n');
  console.log('Credentials (password for both):', PASSWORD);
  console.log('  Customer:', CUSTOMER.email);
  console.log('  Admin:   ', ADMIN.email);
  console.log('\nOpen Swagger:', `${BASE_URL}/api`);
}

main().catch((error) => {
  console.error('\nSeed failed:', error.message);
  process.exit(1);
});
