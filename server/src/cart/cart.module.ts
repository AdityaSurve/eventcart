import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [OrdersModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
