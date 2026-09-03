import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { CartService } from '../cart/cart.service';
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

  async demoCheckout(userId: string) {
    const cart = await this.cartService.getCart(userId);

    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const order = await this.ordersService.create(userId, {
      items: cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

    const paid = await this.ordersService.markPaid(order.id, {
      provider: 'DEMO',
      paymentRef: `demo_${randomBytes(6).toString('hex')}`,
    });

    await this.cartService.clearCart(userId);
    return paid;
  }

  async createStripeCheckoutSession(userId: string) {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY or use demo checkout.',
      );
    }

    const cart = await this.cartService.getCart(userId);

    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const apiUrl = this.configService.get<string>(
      'API_PUBLIC_URL',
      'http://localhost:3000',
    );

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${apiUrl}/payments/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl()}/cart?cancelled=1`,
      line_items: cart.items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(item.unitPrice * 100),
          product_data: {
            name: item.product.name,
          },
        },
      })),
      metadata: {
        userId,
      },
    });

    await this.redis.set(
      `stripe:session:${session.id}`,
      JSON.stringify({
        userId,
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
    const userId = session.metadata?.userId;

    if (!userId || !cached) {
      throw new BadRequestException('Checkout session expired or invalid');
    }

    const payload = JSON.parse(cached) as {
      userId: string;
      items: { productId: string; quantity: number }[];
    };

    const existing = await this.prisma.order.findFirst({
      where: { paymentRef: sessionId },
    });

    if (existing) {
      return this.ordersService.findOne(existing.id);
    }

    const order = await this.ordersService.create(payload.userId, {
      items: payload.items,
    });

    const paid = await this.ordersService.markPaid(order.id, {
      provider: 'STRIPE',
      paymentRef: sessionId,
    });

    await this.cartService.clearCart(payload.userId);
    await this.redis.del(`stripe:session:${sessionId}`);
    return paid;
  }
}
