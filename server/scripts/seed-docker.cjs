require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/src/generated/prisma/client');

const products = [
  {
    name: 'Event T-Shirt',
    slug: 'event-t-shirt',
    description: 'Cotton tee for the event',
    price: 24.99,
    stock: 100,
  },
  {
    name: 'Event Mug',
    slug: 'event-mug',
    description: 'Ceramic mug',
    price: 12.5,
    stock: 50,
  },
  {
    name: 'Lanyard',
    slug: 'event-lanyard',
    description: 'Printed lanyard',
    price: 6.0,
    stock: 200,
  },
  {
    name: 'Sticker Pack',
    slug: 'sticker-pack',
    description: 'Set of 8 stickers',
    price: 4.5,
    stock: 300,
  },
  {
    name: 'Tote Bag',
    slug: 'tote-bag',
    description: 'Canvas tote',
    price: 18.0,
    stock: 80,
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: product,
      create: product,
    });
  }

  console.log(`Seeded ${products.length} products`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
