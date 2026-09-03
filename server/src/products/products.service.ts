import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateProductDto } from './dto/products.create';
import { ListProductsQueryDto } from './dto/products.query';
import { UpdateProductDto } from './dto/products.update';

type ProductRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: Prisma.Decimal;
  stock: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly listCacheTtlSeconds = 60;
  private readonly listCachePrefix = 'products:list:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async create(dto: CreateProductDto) {
    try {
      const product = await this.prisma.product.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          price: dto.price,
          stock: dto.stock ?? 0,
          isActive: dto.isActive ?? true,
        },
      });

      await this.invalidateListCache();
      return this.toResponse(product);
    } catch (error) {
      this.handlePrismaError(error, dto.slug);
    }
  }

  async findAll(query: ListProductsQueryDto) {
    const cacheKey = this.buildListCacheKey(query);
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit: ${cacheKey}`);
      return JSON.parse(cached);
    }

    this.logger.debug(`Cache miss: ${cacheKey}`);
    const result = await this.findAllFromDb(query);

    await this.redisService.set(
      cacheKey,
      JSON.stringify(result),
      this.listCacheTtlSeconds,
    );

    return result;
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    return this.toResponse(product);
  }

  async findBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({ where: { slug } });

    if (!product) {
      throw new NotFoundException(`Product with slug "${slug}" not found`);
    }

    return this.toResponse(product);
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOneOrThrow(id);

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.slug !== undefined && { slug: dto.slug }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.stock !== undefined && { stock: dto.stock }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });

      await this.invalidateListCache();
      return this.toResponse(product);
    } catch (error) {
      this.handlePrismaError(error, dto.slug);
    }
  }

  async deactivate(id: string) {
    await this.findOneOrThrow(id);

    const product = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    await this.invalidateListCache();
    return this.toResponse(product);
  }

  private async findAllFromDb(query: ListProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: items.map((product) => this.toResponse(product)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private async findOneOrThrow(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    return product;
  }

  private buildListCacheKey(query: ListProductsQueryDto) {
    const parts = [
      `page=${query.page ?? 1}`,
      `limit=${query.limit ?? 20}`,
      `isActive=${query.isActive ?? 'all'}`,
      `search=${query.search ?? ''}`,
    ];

    return `${this.listCachePrefix}${parts.join('&')}`;
  }

  private async invalidateListCache() {
    await this.redisService.delByPattern(`${this.listCachePrefix}*`);
    this.logger.debug('Invalidated product list cache');
  }

  private toResponse(product: ProductRecord) {
    return {
      ...product,
      price: product.price.toNumber(),
    };
  }

  private handlePrismaError(error: unknown, slug?: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        slug
          ? `Product with slug "${slug}" already exists`
          : 'Product with this slug already exists',
      );
    }

    throw error;
  }
}
