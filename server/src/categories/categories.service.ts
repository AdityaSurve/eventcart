import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: true } },
      },
    });
  }

  async create(dto: CreateCategoryDto) {
    try {
      const category = await this.prisma.category.create({ data: dto });
      await this.invalidateProductListCache();
      return category;
    } catch (error) {
      this.handleUnique(error, dto.slug);
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOneOrThrow(id);
    try {
      const category = await this.prisma.category.update({
        where: { id },
        data: dto,
      });
      await this.invalidateProductListCache();
      return category;
    } catch (error) {
      this.handleUnique(error, dto.slug);
    }
  }

  async remove(id: string) {
    await this.findOneOrThrow(id);
    await this.prisma.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    });
    await this.prisma.category.delete({ where: { id } });
    await this.invalidateProductListCache();
    return { ok: true };
  }

  private async findOneOrThrow(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category "${id}" not found`);
    }
    return category;
  }

  private async invalidateProductListCache() {
    await this.redisService.delByPattern('products:list:*');
  }

  private handleUnique(error: unknown, slug?: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        slug
          ? `Category slug "${slug}" already exists`
          : 'Category slug already exists',
      );
    }
    throw error;
  }
}
