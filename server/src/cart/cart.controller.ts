import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  RequestUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartService } from './cart.service';

@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user cart' })
  @ApiOkResponse({ description: 'Cart with product details' })
  getCart(@CurrentUser() user: RequestUser) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add or increment an item in the cart' })
  @ApiOkResponse({ description: 'Updated cart' })
  addItem(@CurrentUser() user: RequestUser, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.id, dto);
  }

  @Patch('items/:productId')
  @ApiOperation({ summary: 'Update item quantity (0 removes the item)' })
  @ApiOkResponse({ description: 'Updated cart' })
  updateItem(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(user.id, productId, dto);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove an item from the cart' })
  @ApiOkResponse({ description: 'Updated cart' })
  removeItem(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
  ) {
    return this.cartService.removeItem(user.id, productId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear the cart' })
  @ApiOkResponse({ description: 'Empty cart' })
  clearCart(@CurrentUser() user: RequestUser) {
    return this.cartService.clearCart(user.id);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Checkout cart and create an order' })
  @ApiCreatedResponse({ description: 'Order created from cart' })
  checkout(@CurrentUser() user: RequestUser) {
    return this.cartService.checkout(user.id);
  }
}
