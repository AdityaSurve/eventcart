import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import {
  CartOwner,
  CartOwnerParam,
} from '../common/decorators/cart-owner.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { GuestCheckoutBodyDto } from './dto/guest-checkout.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('methods')
  @ApiOperation({ summary: 'Available payment methods' })
  methods() {
    return this.paymentsService.availableMethods();
  }

  @Post('demo/checkout')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Guest-Id', required: false })
  @ApiOperation({ summary: 'Demo checkout — no real card charged' })
  demoCheckout(
    @CartOwnerParam() owner: CartOwner | null,
    @Body() body: GuestCheckoutBodyDto,
  ) {
    return this.paymentsService.demoCheckout(this.requireOwner(owner), body);
  }

  @Post('stripe/checkout-session')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Guest-Id', required: false })
  @ApiOperation({ summary: 'Create Stripe Checkout Session (test mode)' })
  stripeCheckout(
    @CartOwnerParam() owner: CartOwner | null,
    @Body() body: GuestCheckoutBodyDto,
  ) {
    return this.paymentsService.createStripeCheckoutSession(
      this.requireOwner(owner),
      body,
    );
  }

  @Get('stripe/success')
  @ApiOperation({ summary: 'Stripe success return — finalize order' })
  async stripeSuccess(
    @Query('session_id') sessionId: string,
    @Res() res: Response,
  ) {
    const order = await this.paymentsService.completeStripeSession(sessionId);
    const frontend = this.paymentsService.frontendUrl();
    const guestQs =
      order.guestEmail != null
        ? `?paid=1&guestEmail=${encodeURIComponent(order.guestEmail)}`
        : '?paid=1';
    return res.redirect(`${frontend}/orders/${order.id}${guestQs}`);
  }

  private requireOwner(owner: CartOwner | null): CartOwner {
    if (!owner) {
      throw new BadRequestException(
        'Authenticate or send X-Guest-Id header for checkout',
      );
    }
    return owner;
  }
}
