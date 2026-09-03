import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import {
  CurrentUser,
  RequestUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Demo checkout — no real card charged' })
  demoCheckout(@CurrentUser() user: RequestUser) {
    return this.paymentsService.demoCheckout(user.id);
  }

  @Post('stripe/checkout-session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe Checkout Session (test mode)' })
  stripeCheckout(@CurrentUser() user: RequestUser) {
    return this.paymentsService.createStripeCheckoutSession(user.id);
  }

  @Get('stripe/success')
  @ApiOperation({ summary: 'Stripe success return — finalize order' })
  async stripeSuccess(
    @Query('session_id') sessionId: string,
    @Res() res: Response,
  ) {
    const order = await this.paymentsService.completeStripeSession(sessionId);
    const frontend = this.paymentsService.frontendUrl();
    return res.redirect(`${frontend}/orders/${order.id}?paid=1`);
  }
}
