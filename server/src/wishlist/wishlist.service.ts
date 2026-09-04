import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: true,
      },
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        productId: item.productId,
        createdAt: item.createdAt,
        product: {
          id: item.product.id,
          name: item.product.name,
          slug: item.product.slug,
          price: item.product.price.toNumber(),
          stock: item.product.stock,
          isActive: item.product.isActive,
          imageUrl:
            item.product.imageUrl ??
            `https://picsum.photos/seed/${encodeURIComponent(item.product.slug)}/800/600`,
        },
      })),
    };
  }

  async add(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found or unavailable');
    }

    try {
      await this.prisma.wishlistItem.create({
        data: { userId, productId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Product already in wishlist');
      }
      throw error;
    }

    return this.list(userId);
  }

  async remove(userId: string, productId: string) {
    const existing = await this.prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });

    if (!existing) {
      throw new NotFoundException('Wishlist item not found');
    }

    await this.prisma.wishlistItem.delete({ where: { id: existing.id } });
    return this.list(userId);
  }

  async has(userId: string, productId: string) {
    const existing = await this.prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    return { wished: Boolean(existing) };
  }
}
