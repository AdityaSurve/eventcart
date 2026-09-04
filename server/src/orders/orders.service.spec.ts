import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { KafkaProducerService } from '../events/kafka-producer.service';
import { KAFKA_TOPICS } from '../events/kafka.topics';
import { OrderStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('./orders.gateway', () => ({
  OrdersGateway: class OrdersGateway {
    emitOrderUpdated = jest.fn();
  },
}));

import { OrdersService } from './orders.service';
import { OrdersGateway } from './orders.gateway';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    product: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let kafkaProducer: { publish: jest.Mock; topics: typeof KAFKA_TOPICS };

  const product = {
    id: 'p1',
    name: 'Mug',
    slug: 'mug',
    isActive: true,
    stock: 10,
    price: new Prisma.Decimal('12.50'),
  };

  const createdOrder = {
    id: 'o1',
    orderNumber: 'EC-TEST',
    status: OrderStatus.PENDING,
    paymentStatus: 'UNPAID',
    paymentProvider: null,
    paymentRef: null,
    subtotal: new Prisma.Decimal('25.00'),
    discount: new Prisma.Decimal('0'),
    total: new Prisma.Decimal('25.00'),
    couponCode: null,
    guestEmail: null,
    guestName: null,
    userId: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'i1',
        quantity: 2,
        unitPrice: new Prisma.Decimal('12.50'),
        lineTotal: new Prisma.Decimal('25.00'),
        productId: 'p1',
        product: { id: 'p1', name: 'Mug', slug: 'mug', imageUrl: null },
      },
    ],
    statusHistory: [],
    user: { id: 'u1', name: 'Ada', email: 'ada@test.com' },
  };

  beforeEach(async () => {
    prisma = {
      product: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    kafkaProducer = {
      publish: jest.fn().mockResolvedValue(undefined),
      topics: KAFKA_TOPICS,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: KafkaProducerService, useValue: kafkaProducer },
        { provide: OrdersGateway, useValue: { emitOrderUpdated: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  it('creates an order, decrements stock, and publishes order.placed', async () => {
    prisma.product.findMany.mockResolvedValue([product]);
    const tx = {
      order: { create: jest.fn().mockResolvedValue(createdOrder) },
      product: { update: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );

    const result = await service.create({
      userId: 'u1',
      items: [{ productId: 'p1', quantity: 2 }],
    });

    expect(result.total).toBe(25);
    expect(result.items[0].lineTotal).toBe(25);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stock: { decrement: 2 } },
    });
    expect(kafkaProducer.publish).toHaveBeenCalledWith(
      KAFKA_TOPICS.ORDER_PLACED,
      'o1',
      expect.objectContaining({ orderId: 'o1', userId: 'u1', total: 25 }),
    );
  });

  it('rejects missing products', async () => {
    prisma.product.findMany.mockResolvedValue([]);

    await expect(
      service.create({ userId: 'u1', items: [{ productId: 'missing', quantity: 1 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects inactive products', async () => {
    prisma.product.findMany.mockResolvedValue([{ ...product, isActive: false }]);

    await expect(
      service.create({ userId: 'u1', items: [{ productId: 'p1', quantity: 1 }] }),
    ).rejects.toThrow('not available');
  });

  it('rejects insufficient stock', async () => {
    prisma.product.findMany.mockResolvedValue([{ ...product, stock: 1 }]);

    await expect(
      service.create({ userId: 'u1', items: [{ productId: 'p1', quantity: 5 }] }),
    ).rejects.toThrow('Insufficient stock');
  });

  it('merges duplicate line items before stock checks', async () => {
    prisma.product.findMany.mockResolvedValue([product]);

    await expect(
      service.create({
        userId: 'u1',
        items: [
          { productId: 'p1', quantity: 6 },
          { productId: 'p1', quantity: 5 },
        ],
      }),
    ).rejects.toThrow('Insufficient stock');
  });
});
