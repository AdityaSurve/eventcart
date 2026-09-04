import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CouponType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }).then(
      (rows) => rows.map((row) => this.toResponse(row)),
    );
  }

  async create(dto: CreateCouponDto) {
    try {
      const coupon = await this.prisma.coupon.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          type: dto.type,
          value: dto.value,
          minSubtotal: dto.minSubtotal,
          maxUses: dto.maxUses,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
          isActive: dto.isActive ?? true,
        },
      });
      return this.toResponse(coupon);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Coupon code already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCouponDto) {
    await this.findOneOrThrow(id);
    const coupon = await this.prisma.coupon.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.minSubtotal !== undefined && { minSubtotal: dto.minSubtotal }),
        ...(dto.maxUses !== undefined && { maxUses: dto.maxUses }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    return this.toResponse(coupon);
  }

  async remove(id: string) {
    await this.findOneOrThrow(id);
    await this.prisma.coupon.delete({ where: { id } });
    return { ok: true };
  }

  async validate(code: string, subtotal: number) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.trim().toUpperCase() },
    });

    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('Invalid or inactive coupon');
    }

    if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Coupon has expired');
    }

    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    const min = coupon.minSubtotal?.toNumber() ?? 0;
    if (subtotal < min) {
      throw new BadRequestException(
        `Order subtotal must be at least $${min.toFixed(2)} for this coupon`,
      );
    }

    const discount = this.computeDiscount(coupon.type, coupon.value.toNumber(), subtotal);

    return {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value.toNumber(),
      discount,
      subtotal,
      total: Math.max(0, Number((subtotal - discount).toFixed(2))),
    };
  }

  async redeem(code: string) {
    await this.prisma.coupon.update({
      where: { code: code.trim().toUpperCase() },
      data: { usedCount: { increment: 1 } },
    });
  }

  private computeDiscount(type: CouponType, value: number, subtotal: number) {
    if (type === CouponType.PERCENT) {
      return Number(((subtotal * value) / 100).toFixed(2));
    }
    return Number(Math.min(value, subtotal).toFixed(2));
  }

  private async findOneOrThrow(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) {
      throw new NotFoundException(`Coupon "${id}" not found`);
    }
    return coupon;
  }

  private toResponse(coupon: {
    id: string;
    code: string;
    type: CouponType;
    value: Prisma.Decimal;
    minSubtotal: Prisma.Decimal | null;
    maxUses: number | null;
    usedCount: number;
    expiresAt: Date | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...coupon,
      value: coupon.value.toNumber(),
      minSubtotal: coupon.minSubtotal?.toNumber() ?? null,
    };
  }
}
