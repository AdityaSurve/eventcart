require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/src/generated/prisma/client');

const categories = [
  { name: 'Apparel', slug: 'apparel' },
  { name: 'Drinkware', slug: 'drinkware' },
  { name: 'Accessories', slug: 'accessories' },
];

const products = [
  {
    name: 'Event T-Shirt',
    slug: 'event-t-shirt',
    description: 'Cotton tee for the event',
    imageUrl: 'https://picsum.photos/seed/event-t-shirt/800/600',
    price: 24.99,
    stock: 100,
    categorySlug: 'apparel',
  },
  {
    name: 'Event Mug',
    slug: 'event-mug',
    description: 'Ceramic mug',
    imageUrl: 'https://picsum.photos/seed/event-mug/800/600',
    price: 12.5,
    stock: 8,
    categorySlug: 'drinkware',
  },
  {
    name: 'Lanyard',
    slug: 'event-lanyard',
    description: 'Printed lanyard',
    imageUrl: 'https://picsum.photos/seed/event-lanyard/800/600',
    price: 6.0,
    stock: 200,
    categorySlug: 'accessories',
  },
  {
    name: 'Sticker Pack',
    slug: 'sticker-pack',
    description: 'Set of 8 stickers',
    imageUrl: 'https://picsum.photos/seed/sticker-pack/800/600',
    price: 4.5,
    stock: 5,
    categorySlug: 'accessories',
  },
  {
    name: 'Tote Bag',
    slug: 'tote-bag',
    description: 'Canvas tote',
    imageUrl: 'https://picsum.photos/seed/tote-bag/800/600',
    price: 18.0,
    stock: 80,
    categorySlug: 'apparel',
  },
];

const coupons = [
  {
    code: 'WELCOME10',
    type: 'PERCENT',
    value: 10,
    minSubtotal: 20,
    maxUses: 1000,
    isActive: true,
  },
  {
    code: 'SAVE5',
    type: 'FIXED',
    value: 5,
    minSubtotal: 15,
    maxUses: 500,
    isActive: true,
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

  const categoryIds = {};
  for (const category of categories) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category,
    });
    categoryIds[category.slug] = row.id;
  }

  for (const product of products) {
    const { categorySlug, ...data } = product;
    await prisma.product.upsert({
      where: { slug: data.slug },
      update: {
        ...data,
        categoryId: categoryIds[categorySlug],
      },
      create: {
        ...data,
        categoryId: categoryIds[categorySlug],
      },
    });
  }

  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {
        type: coupon.type,
        value: coupon.value,
        minSubtotal: coupon.minSubtotal,
        maxUses: coupon.maxUses,
        isActive: coupon.isActive,
      },
      create: coupon,
    });
  }

  console.log(
    `Seeded ${categories.length} categories, ${products.length} products, ${coupons.length} coupons`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
