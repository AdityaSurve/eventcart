import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { KafkaConsumerService } from '../src/events/kafka-consumer.service';
import { KafkaProducerService } from '../src/events/kafka-producer.service';
import { KAFKA_TOPICS } from '../src/events/kafka.topics';
import { Prisma, Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

describe('Auth + orders (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const kafkaPublish = jest.fn().mockResolvedValue(undefined);

  const createdOrder = {
    id: 'ord_1',
    orderNumber: 'EC-E2E',
    status: 'PENDING',
    subtotal: new Prisma.Decimal('10.00'),
    total: new Prisma.Decimal('10.00'),
    userId: 'user_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item_1',
        quantity: 1,
        unitPrice: new Prisma.Decimal('10.00'),
        lineTotal: new Prisma.Decimal('10.00'),
        productId: 'prod_1',
        product: { id: 'prod_1', name: 'Mug', slug: 'mug' },
      },
    ],
    statusHistory: [],
    user: { id: 'user_1', name: 'Test User', email: 'e2e@test.com' },
  };

  const prisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      process.env.JWT_SECRET = 'test-jwt-secret-must-be-32-chars-min';
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        del: jest.fn(),
        delByPattern: jest.fn(),
      })
      .overrideProvider(KafkaProducerService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        publish: kafkaPublish,
        topics: KAFKA_TOPICS,
      })
      .overrideProvider(KafkaConsumerService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / is public', async () => {
    await request(app.getHttpServer()).get('/').expect(200);
  });

  it('rejects unauthenticated product writes', async () => {
    await request(app.getHttpServer())
      .post('/products')
      .send({ name: 'Hack', slug: 'hack-item', price: 1, stock: 1 })
      .expect(401);
  });

  it('rejects customer product writes', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      name: 'Test User',
      email: 'e2e@test.com',
      role: Role.CUSTOMER,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const token = jwtService.sign({
      sub: 'user_1',
      email: 'e2e@test.com',
      role: Role.CUSTOMER,
    });

    await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hack', slug: 'hack-item', price: 1, stock: 1 })
      .expect(403);
  });

  it('registers then places an order', async () => {
    prisma.user.create.mockResolvedValue({
      id: 'user_1',
      name: 'Test User',
      email: 'e2e@test.com',
      role: Role.CUSTOMER,
      passwordHash: 'hashed',
      googleId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      name: 'Test User',
      email: 'e2e@test.com',
      role: Role.CUSTOMER,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'prod_1',
        name: 'Mug',
        slug: 'mug',
        isActive: true,
        stock: 20,
        price: new Prisma.Decimal('10.00'),
      },
    ]);
    prisma.$transaction.mockImplementation(
      async (fn: (tx: { order: { create: jest.Mock }; product: { update: jest.Mock } }) => unknown) =>
        fn({
          order: { create: jest.fn().mockResolvedValue(createdOrder) },
          product: { update: jest.fn() },
        }),
    );

    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Test User',
        email: 'e2e@test.com',
        password: 'TestPass123',
      })
      .expect(201);

    expect(register.body.accessToken).toBeTruthy();
    expect(register.body.user.passwordHash).toBeUndefined();

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${register.body.accessToken}`)
      .send({ items: [{ productId: 'prod_1', quantity: 1 }] })
      .expect(201);

    expect(orderRes.body.orderNumber).toBe('EC-E2E');
    expect(orderRes.body.total).toBe(10);
    expect(kafkaPublish).toHaveBeenCalled();
  });
});
