import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProduct(productId: string) {
    await this.assertProduct(productId);

    const [items, aggregate] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true } },
        },
      }),
      this.prisma.review.aggregate({
        where: { productId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        rating: item.rating,
        body: item.body,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        user: item.user,
      })),
      avgRating: aggregate._avg.rating
        ? Number(aggregate._avg.rating.toFixed(2))
        : null,
      reviewCount: aggregate._count.rating,
    };
  }

  async create(productId: string, userId: string, dto: CreateReviewDto) {
    await this.assertProduct(productId);

    try {
      const review = await this.prisma.review.create({
        data: {
          productId,
          userId,
          rating: dto.rating,
          body: dto.body,
        },
        include: {
          user: { select: { id: true, name: true } },
        },
      });

      return {
        id: review.id,
        rating: review.rating,
        body: review.body,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        user: review.user,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('You already reviewed this product');
      }
      throw error;
    }
  }

  async remove(
    reviewId: string,
    currentUser: { id: string; role: Role },
  ) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (
      currentUser.role !== Role.ADMIN &&
      review.userId !== currentUser.id
    ) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    await this.prisma.review.delete({ where: { id: reviewId } });
    return { ok: true };
  }

  async ratingsForProducts(productIds: string[]) {
    if (!productIds.length) {
      return new Map<string, { avgRating: number | null; reviewCount: number }>();
    }

    const grouped = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return new Map(
      grouped.map((row) => [
        row.productId,
        {
          avgRating: row._avg.rating
            ? Number(row._avg.rating.toFixed(2))
            : null,
          reviewCount: row._count.rating,
        },
      ]),
    );
  }

  private async assertProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException(`Product "${productId}" not found`);
    }
    return product;
  }
}
