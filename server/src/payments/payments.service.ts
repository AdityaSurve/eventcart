import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { CartOwner } from '../common/decorators/cart-owner.decorator';
import { CartService } from '../cart/cart.service';
import { CouponsService } from '../coupons/coupons.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class PaymentsService {
  private stripe: Stripe | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly cartService: CartService,
    private readonly ordersService: OrdersService,
    private readonly couponsService: CouponsService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    const key = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (key) {
      this.stripe = new Stripe(key);
    }
  }

  availableMethods() {
    return {
      demo: true,
      stripe: Boolean(this.stripe),
    };
  }

  frontendUrl() {
    return this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
  }

  async demoCheckout(
    owner: CartOwner,
    guest?: { guestName?: string; guestEmail?: string },
  ) {
    const cart = await this.cartService.getCart(owner);

    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    if (owner.kind === 'guest') {
      if (!guest?.guestEmail?.trim() || !guest?.guestName?.trim()) {
        throw new BadRequestException(
          'guestName and guestEmail are required for guest checkout',
        );
      }
    }

    const order = await this.ordersService.create({
      userId: owner.kind === 'user' ? owner.id : null,
      guestEmail:
        owner.kind === 'guest'
          ? guest!.guestEmail!.trim().toLowerCase()
          : undefined,
      guestName: owner.kind === 'guest' ? guest!.guestName!.trim() : undefined,
      couponCode: cart.couponCode,
      discount: cart.discount,
      items: cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

    if (cart.couponCode) {
      await this.couponsService.redeem(cart.couponCode);
    }

    const paid = await this.ordersService.markPaid(order.id, {
      provider: 'DEMO',
      paymentRef: `demo_${randomBytes(6).toString('hex')}`,
    });

    await this.cartService.clearCart(owner);
    return paid;
  }

  async createStripeCheckoutSession(
    owner: CartOwner,
    guest?: { guestName?: string; guestEmail?: string },
  ) {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY or use demo checkout.',
      );
    }

    const cart = await this.cartService.getCart(owner);

    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    if (owner.kind === 'guest') {
      if (!guest?.guestEmail?.trim() || !guest?.guestName?.trim()) {
        throw new BadRequestException(
          'guestName and guestEmail are required for guest checkout',
        );
      }
    }

    const apiUrl = this.configService.get<string>(
      'API_PUBLIC_URL',
      'http://localhost:3000',
    );

    const lineItems = cart.items.map((item) => {
      let unitAmount = Math.round(item.unitPrice * 100);
      if (cart.discount > 0 && cart.subtotal > 0) {
        const share = item.lineTotal / cart.subtotal;
        const itemDiscount = cart.discount * share;
        unitAmount = Math.max(
          0,
          Math.round(((item.lineTotal - itemDiscount) / item.quantity) * 100),
        );
      }
      return {
        quantity: item.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: unitAmount,
          product_data: {
            name: item.product.name,
          },
        },
      };
    });

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${apiUrl}/payments/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl()}/cart?cancelled=1`,
      customer_email:
        owner.kind === 'guest' ? guest!.guestEmail!.trim().toLowerCase() : undefined,
      line_items: lineItems,
      metadata: {
        ownerKind: owner.kind,
        ownerId: owner.id,
        guestEmail:
          owner.kind === 'guest' ? guest!.guestEmail!.trim().toLowerCase() : '',
        guestName: owner.kind === 'guest' ? guest!.guestName!.trim() : '',
        couponCode: cart.couponCode ?? '',
        discount: String(cart.discount ?? 0),
      },
    });

    await this.redis.set(
      `stripe:session:${session.id}`,
      JSON.stringify({
        owner,
        guestEmail:
          owner.kind === 'guest'
            ? guest!.guestEmail!.trim().toLowerCase()
            : undefined,
        guestName: owner.kind === 'guest' ? guest!.guestName!.trim() : undefined,
        couponCode: cart.couponCode,
        discount: cart.discount,
        items: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      }),
      60 * 60,
    );

    return { url: session.url, sessionId: session.id };
  }

  async completeStripeSession(sessionId: string) {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }

    if (!sessionId) {
      throw new BadRequestException('session_id is required');
    }

    const session = await this.stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      throw new BadRequestException('Payment not completed');
    }

    const cached = await this.redis.get(`stripe:session:${sessionId}`);

    if (!cached) {
      throw new BadRequestException('Checkout session expired or invalid');
    }

    const payload = JSON.parse(cached) as {
      owner: CartOwner;
      guestEmail?: string;
      guestName?: string;
      couponCode?: string | null;
      discount?: number;
      items: { productId: string; quantity: number }[];
    };

    const existing = await this.prisma.order.findFirst({
      where: { paymentRef: sessionId },
    });

    if (existing) {
      return this.ordersService.findOne(existing.id);
    }

    const order = await this.ordersService.create({
      userId: payload.owner.kind === 'user' ? payload.owner.id : null,
      guestEmail: payload.guestEmail,
      guestName: payload.guestName,
      couponCode: payload.couponCode,
      discount: payload.discount ?? 0,
      items: payload.items,
    });

    if (payload.couponCode) {
      await this.couponsService.redeem(payload.couponCode);
    }

    const paid = await this.ordersService.markPaid(order.id, {
      provider: 'STRIPE',
      paymentRef: sessionId,
    });

    await this.cartService.clearCart(payload.owner);
    await this.redis.del(`stripe:session:${sessionId}`);
    return paid;
  }
}
