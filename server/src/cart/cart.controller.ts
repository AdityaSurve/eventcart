import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CartOwner,
  CartOwnerParam,
  OptionalUser,
} from '../common/decorators/cart-owner.decorator';
import { RequestUser } from '../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { ApplyCartCouponDto } from '../coupons/dto/coupon.dto';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartService } from './cart.service';

class GuestCheckoutDto {
  guestName?: string;
  guestEmail?: string;
}

@ApiTags('cart')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Guest-Id', required: false })
@UseGuards(OptionalJwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current cart (user or guest)' })
  @ApiOkResponse({ description: 'Cart with product details' })
  getCart(@CartOwnerParam() owner: CartOwner | null) {
    return this.cartService.getCart(this.requireOwner(owner));
  }

  @Post('items')
  @ApiOperation({ summary: 'Add or increment an item in the cart' })
  @ApiOkResponse({ description: 'Updated cart' })
  addItem(
    @CartOwnerParam() owner: CartOwner | null,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.addItem(this.requireOwner(owner), dto);
  }

  @Patch('items/:productId')
  @ApiOperation({ summary: 'Update item quantity (0 removes the item)' })
  @ApiOkResponse({ description: 'Updated cart' })
  updateItem(
    @CartOwnerParam() owner: CartOwner | null,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(
      this.requireOwner(owner),
      productId,
      dto,
    );
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove an item from the cart' })
  @ApiOkResponse({ description: 'Updated cart' })
  removeItem(
    @CartOwnerParam() owner: CartOwner | null,
    @Param('productId') productId: string,
  ) {
    return this.cartService.removeItem(this.requireOwner(owner), productId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear the cart' })
  @ApiOkResponse({ description: 'Empty cart' })
  clearCart(@CartOwnerParam() owner: CartOwner | null) {
    return this.cartService.clearCart(this.requireOwner(owner));
  }

  @Post('coupon')
  @ApiOperation({ summary: 'Apply a coupon code to the cart' })
  applyCoupon(
    @CartOwnerParam() owner: CartOwner | null,
    @Body() dto: ApplyCartCouponDto,
  ) {
    return this.cartService.applyCoupon(this.requireOwner(owner), dto.code);
  }

  @Delete('coupon')
  @ApiOperation({ summary: 'Remove coupon from the cart' })
  removeCoupon(@CartOwnerParam() owner: CartOwner | null) {
    return this.cartService.removeCoupon(this.requireOwner(owner));
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Checkout cart and create an order' })
  @ApiCreatedResponse({ description: 'Order created from cart' })
  checkout(
    @CartOwnerParam() owner: CartOwner | null,
    @Body() body: GuestCheckoutDto,
  ) {
    return this.cartService.checkout(this.requireOwner(owner), body);
  }

  @Post('merge')
  @ApiOperation({ summary: 'Merge guest cart into the logged-in user cart' })
  merge(
    @OptionalUser() user: RequestUser | null,
    @Headers('x-guest-id') guestId?: string,
  ) {
    if (!user) {
      throw new BadRequestException('Login required to merge cart');
    }
    if (!guestId?.trim()) {
      throw new BadRequestException('X-Guest-Id header is required');
    }
    return this.cartService.mergeGuestIntoUser(guestId.trim(), user.id);
  }

  private requireOwner(owner: CartOwner | null): CartOwner {
    if (!owner) {
      throw new BadRequestException(
        'Authenticate or send X-Guest-Id header for guest cart',
      );
    }
    return owner;
  }
}
