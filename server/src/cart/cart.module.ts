import { Module } from '@nestjs/common';
import { CouponsModule } from '../coupons/coupons.module';
import { OrdersModule } from '../orders/orders.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [OrdersModule, CouponsModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
