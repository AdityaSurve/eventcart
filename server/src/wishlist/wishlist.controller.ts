import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  RequestUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WishlistService } from './wishlist.service';

@ApiTags('wishlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'List wishlist items' })
  @ApiOkResponse({ description: 'Wishlist' })
  list(@CurrentUser() user: RequestUser) {
    return this.wishlistService.list(user.id);
  }

  @Post(':productId')
  @ApiOperation({ summary: 'Add product to wishlist' })
  add(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.add(user.id, productId);
  }

  @Delete(':productId')
  @ApiOperation({ summary: 'Remove product from wishlist' })
  remove(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.remove(user.id, productId);
  }

  @Get(':productId/status')
  @ApiOperation({ summary: 'Check if product is wishlisted' })
  status(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.has(user.id, productId);
  }
}
