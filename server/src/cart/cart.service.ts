import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OrdersService } from '../orders/orders.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

type CartItem = {
  productId: string;
  quantity: number;
};

@Injectable()
export class CartService {
  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  async getCart(userId: string) {
    const items = await this.getRawItems(userId);
    return this.enrichCart(items);
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found or unavailable');
    }

    const items = await this.getRawItems(userId);
    const existing = items.find((item) => item.productId === dto.productId);

    if (existing) {
      existing.quantity += dto.quantity;
    } else {
      items.push({ productId: dto.productId, quantity: dto.quantity });
    }

    await this.saveItems(userId, items);
    return this.enrichCart(items);
  }

  async updateItem(
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
  ) {
    const items = await this.getRawItems(userId);
    const index = items.findIndex((item) => item.productId === productId);

    if (index === -1) {
      throw new NotFoundException('Item not found in cart');
    }

    if (dto.quantity === 0) {
      items.splice(index, 1);
    } else {
      items[index].quantity = dto.quantity;
    }

    await this.saveItems(userId, items);
    return this.enrichCart(items);
  }

  async removeItem(userId: string, productId: string) {
    const items = await this.getRawItems(userId);
    const nextItems = items.filter((item) => item.productId !== productId);

    if (nextItems.length === items.length) {
      throw new NotFoundException('Item not found in cart');
    }

    await this.saveItems(userId, nextItems);
    return this.enrichCart(nextItems);
  }

  async clearCart(userId: string) {
    await this.redisService.del(this.cartKey(userId));
    return { items: [], subtotal: 0 };
  }

  async checkout(userId: string) {
    const items = await this.getRawItems(userId);

    if (!items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const order = await this.ordersService.create(userId, { items });
    await this.clearCart(userId);

    return order;
  }

  private async getRawItems(userId: string): Promise<CartItem[]> {
    const raw = await this.redisService.get(this.cartKey(userId));

    if (!raw) {
      return [];
    }

    return JSON.parse(raw) as CartItem[];
  }

  private async saveItems(userId: string, items: CartItem[]) {
    await this.redisService.set(this.cartKey(userId), JSON.stringify(items));
  }

  private async enrichCart(items: CartItem[]) {
    if (!items.length) {
      return { items: [], subtotal: 0 };
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: items.map((item) => item.productId) },
        isActive: true,
      },
    });

    const productMap = new Map(products.map((product) => [product.id, product]));

    let subtotal = 0;
    const enrichedItems = items
      .map((item) => {
        const product = productMap.get(item.productId);

        if (!product) {
          return null;
        }

        const price = product.price.toNumber();
        const lineTotal = price * item.quantity;
        subtotal += lineTotal;

        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: price,
          lineTotal,
          product: {
            id: product.id,
            name: product.name,
            slug: product.slug,
            stock: product.stock,
          },
        };
      })
      .filter((item) => item !== null);

    return { items: enrichedItems, subtotal };
  }

  private cartKey(userId: string) {
    return `cart:${userId}`;
  }
}
