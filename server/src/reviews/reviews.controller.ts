import {
  Body,
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
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('products/:productId/reviews')
  @ApiOperation({ summary: 'List reviews for a product' })
  @ApiOkResponse({ description: 'Reviews with average rating' })
  list(@Param('productId') productId: string) {
    return this.reviewsService.listForProduct(productId);
  }

  @Post('products/:productId/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a product review' })
  create(
    @Param('productId') productId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(productId, user.id, dto);
  }

  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete own review (or admin)' })
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.reviewsService.remove(id, user);
  }
}
