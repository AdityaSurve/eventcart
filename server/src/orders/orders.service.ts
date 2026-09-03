import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { KafkaProducerService } from '../events/kafka-producer.service';
import {
  OrderPlacedEvent,
  OrderStatusChangedEvent,
} from '../events/kafka.events';
import { OrderStatus, PaymentStatus, Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersGateway } from './orders.gateway';

const orderInclude = {
  items: {
    include: {
      product: {
        select: { id: true, name: true, slug: true, imageUrl: true },
      },
    },
  },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      changedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  },
  user: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly ordersGateway: OrdersGateway,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const mergedItems = this.mergeItems(dto.items);
    const productIds = [...mergedItems.keys()];

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products were not found');
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const lineItems: {
      productId: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }[] = [];

    let subtotal = new Prisma.Decimal(0);

    for (const [productId, quantity] of mergedItems) {
      const product = productMap.get(productId)!;

      if (!product.isActive) {
        throw new BadRequestException(
          `Product "${product.name}" is not available`,
        );
      }

      if (product.stock < quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}" (requested ${quantity}, available ${product.stock})`,
        );
      }

      const unitPrice = product.price;
      const lineTotal = unitPrice.mul(quantity);
      subtotal = subtotal.add(lineTotal);

      lineItems.push({
        productId,
        quantity,
        unitPrice,
        lineTotal,
      });
    }

    const orderNumber = this.generateOrderNumber();

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          status: OrderStatus.PENDING,
          subtotal,
          total: subtotal,
          userId,
          items: {
            create: lineItems,
          },
          statusHistory: {
            create: {
              status: OrderStatus.PENDING,
              note: 'Order placed',
            },
          },
        },
        include: orderInclude,
      });

      for (const item of lineItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return created;
    });

    const response = this.toResponse(order);

    this.publishOrderPlaced({
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      total: response.total,
      items: response.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      timestamp: new Date().toISOString(),
    });

    return response;
  }

  async findAll(
    query: ListOrdersQueryDto,
    currentUser: { id: string; role: Role },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (currentUser.role === Role.ADMIN) {
      if (query.userId) {
        where.userId = query.userId;
      }
    } else {
      where.userId = currentUser.id;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: orderInclude,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map((order) => this.toResponse(order)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException(`Order with id "${id}" not found`);
    }

    return this.toResponse(order);
  }

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    changedById: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with id "${id}" not found`);
    }

    if (order.status === dto.status) {
      throw new BadRequestException(`Order is already ${dto.status}`);
    }

    const previousStatus = order.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        dto.status === OrderStatus.CANCELLED &&
        order.status !== OrderStatus.CANCELLED
      ) {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      return tx.order.update({
        where: { id },
        data: {
          status: dto.status,
          statusHistory: {
            create: {
              status: dto.status,
              note: dto.note,
              changedById,
            },
          },
        },
        include: orderInclude,
      });
    });

    const response = this.toResponse(updated);

    this.publishOrderStatusChanged({
      orderId: order.id,
      orderNumber: order.orderNumber,
      previousStatus,
      newStatus: dto.status,
      changedById,
      note: dto.note,
      timestamp: new Date().toISOString(),
    });

    this.ordersGateway.emitOrderUpdated({
      orderId: response.id,
      orderNumber: response.orderNumber,
      userId: response.userId,
      status: response.status,
      previousStatus,
      paymentStatus: response.paymentStatus,
    });

    return response;
  }

  async cancelByCustomer(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order) {
      throw new NotFoundException(`Order with id "${id}" not found`);
    }

    if (order.userId !== userId) {
      throw new BadRequestException('You can only cancel your own orders');
    }

    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        'Only pending or confirmed orders can be cancelled',
      );
    }

    return this.updateStatus(
      id,
      { status: OrderStatus.CANCELLED, note: 'Cancelled by customer' },
      userId,
    );
  }

  async markPaid(
    orderId: string,
    payment: {
      provider: string;
      paymentRef: string;
    },
  ) {
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paymentProvider: payment.provider,
        paymentRef: payment.paymentRef,
        status: OrderStatus.CONFIRMED,
        statusHistory: {
          create: {
            status: OrderStatus.CONFIRMED,
            note: `Paid via ${payment.provider}`,
          },
        },
      },
      include: orderInclude,
    });

    const response = this.toResponse(updated);
    this.ordersGateway.emitOrderUpdated({
      orderId: response.id,
      orderNumber: response.orderNumber,
      userId: response.userId,
      status: response.status,
      paymentStatus: response.paymentStatus,
    });
    return response;
  }

  private publishOrderPlaced(event: OrderPlacedEvent) {
    void this.kafkaProducer
      .publish(this.kafkaProducer.topics.ORDER_PLACED, event.orderId, event)
      .catch((error: Error) => {
        this.logger.error(`Failed to publish order.placed: ${error.message}`);
      });
  }

  private publishOrderStatusChanged(event: OrderStatusChangedEvent) {
    void this.kafkaProducer
      .publish(
        this.kafkaProducer.topics.ORDER_STATUS_CHANGED,
        event.orderId,
        event,
      )
      .catch((error: Error) => {
        this.logger.error(
          `Failed to publish order.status.changed: ${error.message}`,
        );
      });
  }

  private mergeItems(items: CreateOrderDto['items']) {
    const merged = new Map<string, number>();

    for (const item of items) {
      merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    }

    return merged;
  }

  private generateOrderNumber() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(2).toString('hex').toUpperCase();
    return `EC-${date}-${suffix}`;
  }

  private toResponse(order: OrderWithRelations) {
    return {
      ...order,
      subtotal: order.subtotal.toNumber(),
      total: order.total.toNumber(),
      items: order.items.map((item) => ({
        ...item,
        unitPrice: item.unitPrice.toNumber(),
        lineTotal: item.lineTotal.toNumber(),
      })),
    };
  }
}
