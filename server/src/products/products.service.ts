import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateProductDto } from './dto/products.create';
import { ListProductsQueryDto } from './dto/products.query';
import { UpdateProductDto } from './dto/products.update';

const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductInclude;

type ProductRecord = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly listCacheTtlSeconds = 60;
  private readonly listCachePrefix = 'products:list:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateProductDto) {
    try {
      const product = await this.prisma.product.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          imageUrl: dto.imageUrl ?? this.defaultImage(dto.slug),
          price: dto.price,
          stock: dto.stock ?? 0,
          isActive: dto.isActive ?? true,
          categoryId: dto.categoryId,
        },
        include: productInclude,
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
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    return this.toResponse(product, await this.ratingFor(id));
  }

  async findBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException(`Product with slug "${slug}" not found`);
    }

    return this.toResponse(product, await this.ratingFor(product.id));
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
          ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.stock !== undefined && { stock: dto.stock }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        },
        include: productInclude,
      });

      await this.invalidateListCache();
      return this.toResponse(product, await this.ratingFor(id));
    } catch (error) {
      this.handlePrismaError(error, dto.slug);
    }
  }

  async deactivate(id: string) {
    await this.findOneOrThrow(id);

    const product = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
      include: productInclude,
    });

    await this.invalidateListCache();
    return this.toResponse(product);
  }

  async findLowStock() {
    const threshold = Number(
      this.configService.get<string>('LOW_STOCK_THRESHOLD') ?? 10,
    );

    const items = await this.prisma.product.findMany({
      where: {
        isActive: true,
        stock: { lte: threshold },
      },
      orderBy: { stock: 'asc' },
      include: productInclude,
    });

    return {
      threshold,
      count: items.length,
      items: items.map((product) => this.toResponse(product)),
    };
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
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.categorySlug) {
      where.category = { slug: query.categorySlug };
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {
        ...(query.minPrice !== undefined && { gte: query.minPrice }),
        ...(query.maxPrice !== undefined && { lte: query.maxPrice }),
      };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.sort === 'price_asc'
        ? { price: 'asc' }
        : query.sort === 'price_desc'
          ? { price: 'desc' }
          : query.sort === 'name'
            ? { name: 'asc' }
            : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: productInclude,
      }),
      this.prisma.product.count({ where }),
    ]);

    const ratings = await this.ratingsFor(items.map((item) => item.id));

    return {
      items: items.map((product) =>
        this.toResponse(product, ratings.get(product.id)),
      ),
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
      `categoryId=${query.categoryId ?? ''}`,
      `categorySlug=${query.categorySlug ?? ''}`,
      `minPrice=${query.minPrice ?? ''}`,
      `maxPrice=${query.maxPrice ?? ''}`,
      `sort=${query.sort ?? 'newest'}`,
    ];

    return `${this.listCachePrefix}${parts.join('&')}`;
  }

  private async invalidateListCache() {
    await this.redisService.delByPattern(`${this.listCachePrefix}*`);
    this.logger.debug('Invalidated product list cache');
  }

  private async ratingFor(productId: string) {
    const map = await this.ratingsFor([productId]);
    return map.get(productId);
  }

  private async ratingsFor(productIds: string[]) {
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

  private toResponse(
    product: ProductRecord,
    rating?: { avgRating: number | null; reviewCount: number },
  ) {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      imageUrl: product.imageUrl ?? this.defaultImage(product.slug),
      price: product.price.toNumber(),
      stock: product.stock,
      isActive: product.isActive,
      categoryId: product.categoryId,
      category: product.category,
      avgRating: rating?.avgRating ?? null,
      reviewCount: rating?.reviewCount ?? 0,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private defaultImage(slug: string) {
    return `https://picsum.photos/seed/${encodeURIComponent(slug)}/800/600`;
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
