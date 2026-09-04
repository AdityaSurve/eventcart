import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CouponsService } from '../coupons/coupons.service';
import { CartOwner } from '../common/decorators/cart-owner.decorator';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

type CartItem = {
  productId: string;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  couponCode: string | null;
};

@Injectable()
export class CartService {
  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly couponsService: CouponsService,
  ) {}

  async getCart(owner: CartOwner) {
    const state = await this.getState(owner);
    return this.enrichCart(state);
  }

  async addItem(owner: CartOwner, dto: AddCartItemDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found or unavailable');
    }

    const state = await this.getState(owner);
    const existing = state.items.find((item) => item.productId === dto.productId);

    if (existing) {
      existing.quantity += dto.quantity;
    } else {
      state.items.push({ productId: dto.productId, quantity: dto.quantity });
    }

    await this.saveState(owner, state);
    return this.enrichCart(state);
  }

  async updateItem(
    owner: CartOwner,
    productId: string,
    dto: UpdateCartItemDto,
  ) {
    const state = await this.getState(owner);
    const index = state.items.findIndex((item) => item.productId === productId);

    if (index === -1) {
      throw new NotFoundException('Item not found in cart');
    }

    if (dto.quantity === 0) {
      state.items.splice(index, 1);
    } else {
      state.items[index].quantity = dto.quantity;
    }

    await this.saveState(owner, state);
    return this.enrichCart(state);
  }

  async removeItem(owner: CartOwner, productId: string) {
    const state = await this.getState(owner);
    const nextItems = state.items.filter((item) => item.productId !== productId);

    if (nextItems.length === state.items.length) {
      throw new NotFoundException('Item not found in cart');
    }

    state.items = nextItems;
    await this.saveState(owner, state);
    return this.enrichCart(state);
  }

  async clearCart(owner: CartOwner) {
    await this.redisService.del(this.cartKey(owner));
    if (owner.kind === 'user') {
      await this.redisService.del(`cart:${owner.id}`);
    }
    return {
      items: [],
      subtotal: 0,
      discount: 0,
      total: 0,
      couponCode: null,
      coupon: null,
    };
  }

  async applyCoupon(owner: CartOwner, code: string) {
    const state = await this.getState(owner);
    const enriched = await this.enrichCart({ ...state, couponCode: null });
    await this.couponsService.validate(code, enriched.subtotal);
    state.couponCode = code.trim().toUpperCase();
    await this.saveState(owner, state);
    return this.enrichCart(state);
  }

  async removeCoupon(owner: CartOwner) {
    const state = await this.getState(owner);
    state.couponCode = null;
    await this.saveState(owner, state);
    return this.enrichCart(state);
  }

  async checkout(
    owner: CartOwner,
    guest?: { guestName?: string; guestEmail?: string },
  ) {
    const state = await this.getState(owner);

    if (!state.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    if (owner.kind === 'guest') {
      if (!guest?.guestEmail?.trim() || !guest?.guestName?.trim()) {
        throw new BadRequestException(
          'guestName and guestEmail are required for guest checkout',
        );
      }
    }

    const cart = await this.enrichCart(state);

    const order = await this.ordersService.create({
      userId: owner.kind === 'user' ? owner.id : null,
      guestEmail:
        owner.kind === 'guest' ? guest!.guestEmail!.trim().toLowerCase() : undefined,
      guestName: owner.kind === 'guest' ? guest!.guestName!.trim() : undefined,
      couponCode: cart.couponCode,
      discount: cart.discount,
      items: state.items,
    });

    if (cart.couponCode) {
      await this.couponsService.redeem(cart.couponCode);
    }

    await this.clearCart(owner);
    return order;
  }

  async mergeGuestIntoUser(guestId: string, userId: string) {
    const guestOwner: CartOwner = { kind: 'guest', id: guestId };
    const userOwner: CartOwner = { kind: 'user', id: userId };
    const guestState = await this.getState(guestOwner);

    if (!guestState.items.length && !guestState.couponCode) {
      return this.getCart(userOwner);
    }

    const userState = await this.getState(userOwner);

    for (const guestItem of guestState.items) {
      const existing = userState.items.find(
        (item) => item.productId === guestItem.productId,
      );
      if (existing) {
        existing.quantity += guestItem.quantity;
      } else {
        userState.items.push({ ...guestItem });
      }
    }

    if (guestState.couponCode && !userState.couponCode) {
      userState.couponCode = guestState.couponCode;
    }

    await this.saveState(userOwner, userState);
    await this.redisService.del(this.cartKey(guestOwner));
    return this.enrichCart(userState);
  }

  private async getState(owner: CartOwner): Promise<CartState> {
    const raw = await this.redisService.get(this.cartKey(owner));

    if (!raw && owner.kind === 'user') {
      const legacy = await this.redisService.get(`cart:${owner.id}`);
      if (legacy) {
        return this.parseState(legacy);
      }
    }

    if (!raw) {
      return { items: [], couponCode: null };
    }

    return this.parseState(raw);
  }

  private parseState(raw: string): CartState {
    const parsed = JSON.parse(raw) as CartItem[] | CartState;

    if (Array.isArray(parsed)) {
      return { items: parsed, couponCode: null };
    }

    return {
      items: parsed.items ?? [],
      couponCode: parsed.couponCode ?? null,
    };
  }

  private async saveState(owner: CartOwner, state: CartState) {
    await this.redisService.set(this.cartKey(owner), JSON.stringify(state));
  }

  private async enrichCart(state: CartState) {
    if (!state.items.length) {
      return {
        items: [],
        subtotal: 0,
        discount: 0,
        total: 0,
        couponCode: null,
        coupon: null,
      };
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: state.items.map((item) => item.productId) },
        isActive: true,
      },
    });

    const productMap = new Map(products.map((product) => [product.id, product]));

    let subtotal = 0;
    const enrichedItems = state.items
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
            imageUrl:
              product.imageUrl ??
              `https://picsum.photos/seed/${encodeURIComponent(product.slug)}/800/600`,
          },
        };
      })
      .filter((item) => item !== null);

    let discount = 0;
    let coupon: {
      code: string;
      type: string;
      value: number;
      discount: number;
    } | null = null;

    if (state.couponCode) {
      try {
        const validated = await this.couponsService.validate(
          state.couponCode,
          subtotal,
        );
        discount = validated.discount;
        coupon = {
          code: validated.code,
          type: validated.type,
          value: validated.value,
          discount: validated.discount,
        };
      } catch {
        coupon = null;
      }
    }

    const total = Math.max(0, Number((subtotal - discount).toFixed(2)));

    return {
      items: enrichedItems,
      subtotal: Number(subtotal.toFixed(2)),
      discount,
      total,
      couponCode: coupon?.code ?? null,
      coupon,
    };
  }

  private cartKey(owner: CartOwner) {
    return `cart:${owner.kind}:${owner.id}`;
  }
}
