import { Injectable } from '@nestjs/common';
import { OrderStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  demandLabel,
  exponentialSmoothing,
  ordinaryLeastSquares,
  predictLinear,
} from './forecast';

const DAY_MS = 24 * 60 * 60 * 1000;
const HORIZON_DAYS = 14;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [orders, items, products] = await Promise.all([
      this.prisma.order.findMany({
        select: {
          id: true,
          status: true,
          total: true,
          createdAt: true,
        },
      }),
      this.prisma.orderItem.findMany({
        where: {
          order: { status: { not: OrderStatus.CANCELLED } },
        },
        select: {
          quantity: true,
          lineTotal: true,
          productId: true,
          product: {
            select: { id: true, name: true, slug: true, price: true, stock: true },
          },
          order: { select: { createdAt: true } },
        },
      }),
      this.prisma.product.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true, price: true, stock: true },
      }),
    ]);

    const paidOrders = orders.filter((order) => order.status !== OrderStatus.CANCELLED);
    const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total), 0);
    const cancelled = orders.filter((order) => order.status === OrderStatus.CANCELLED).length;

    const statusBreakdown = Object.values(OrderStatus).map((status) => ({
      status,
      count: orders.filter((order) => order.status === status).length,
    }));

    const byDay = new Map<string, { revenue: number; orders: number }>();

    for (const order of paidOrders) {
      const day = order.createdAt.toISOString().slice(0, 10);
      const current = byDay.get(day) ?? { revenue: 0, orders: 0 };
      current.revenue += Number(order.total);
      current.orders += 1;
      byDay.set(day, current);
    }

    const revenueByDay = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, ...value }));

    const dailyRevenue = revenueByDay.map((row) => row.revenue);
    const revenueTrend = ordinaryLeastSquares(
      dailyRevenue.map((_, index) => index),
      dailyRevenue,
    );
    const smoothedDaily = exponentialSmoothing(dailyRevenue);
    const projectedRevenue = Array.from({ length: HORIZON_DAYS }, (_, offset) => {
      const x = dailyRevenue.length + offset;
      const linear = predictLinear(revenueTrend, x);
      const blended = 0.6 * linear + 0.4 * smoothedDaily;
      return {
        dayOffset: offset + 1,
        amount: Math.round(blended * 100) / 100,
      };
    });

    const productSeries = new Map<
      string,
      { name: string; slug: string; price: number; stock: number; byDay: Map<string, number> }
    >();

    for (const product of products) {
      productSeries.set(product.id, {
        name: product.name,
        slug: product.slug,
        price: Number(product.price),
        stock: product.stock,
        byDay: new Map(),
      });
    }

    for (const item of items) {
      const entry =
        productSeries.get(item.productId) ??
        {
          name: item.product.name,
          slug: item.product.slug,
          price: Number(item.product.price),
          stock: item.product.stock,
          byDay: new Map(),
        };
      const day = item.order.createdAt.toISOString().slice(0, 10);
      entry.byDay.set(day, (entry.byDay.get(day) ?? 0) + item.quantity);
      productSeries.set(item.productId, entry);
    }

    const allDays = [...new Set([...byDay.keys()])].sort();
    const dayIndex = new Map(allDays.map((day, index) => [day, index]));
    const now = Date.now();
    const recentCutoff = now - 7 * DAY_MS;
    const previousCutoff = now - 14 * DAY_MS;

    const predictions = [...productSeries.entries()].map(([productId, series]) => {
      const days = [...series.byDay.keys()].sort();
      const xs = days.map((day) => dayIndex.get(day) ?? 0);
      const ys = days.map((day) => series.byDay.get(day) ?? 0);
      const model = ordinaryLeastSquares(xs, ys);
      const totalUnits = ys.reduce((sum, n) => sum + n, 0);
      let recent = 0;
      let previous = 0;

      for (const [day, units] of series.byDay) {
        const ts = new Date(`${day}T00:00:00.000Z`).getTime();
        if (ts >= recentCutoff) recent += units;
        else if (ts >= previousCutoff) previous += units;
      }

      const lastX = allDays.length === 0 ? 0 : allDays.length - 1;
      const projectedUnits = Array.from({ length: HORIZON_DAYS }, (_, offset) =>
        predictLinear(model, lastX + offset + 1),
      ).reduce((sum, n) => sum + n, 0);

      const demand = demandLabel({
        slope: model.slope,
        recent,
        previous,
      });

      return {
        productId,
        name: series.name,
        slug: series.slug,
        stock: series.stock,
        unitsSold: totalUnits,
        recentUnits7d: recent,
        previousUnits7d: previous,
        velocityPerDay: Math.round(model.slope * 1000) / 1000,
        demand,
        projectedUnits14d: Math.round(projectedUnits * 10) / 10,
        projectedRevenue14d:
          Math.round(projectedUnits * series.price * 100) / 100,
      };
    });

    predictions.sort((a, b) => b.velocityPerDay - a.velocityPerDay);

    const topProducts = [...predictions]
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 8)
      .map((row) => ({
        name: row.name,
        slug: row.slug,
        unitsSold: row.unitsSold,
        projectedRevenue14d: row.projectedRevenue14d,
      }));

    return {
      kpis: {
        orders: orders.length,
        paidOrders: paidOrders.length,
        cancelledOrders: cancelled,
        revenue: Math.round(revenue * 100) / 100,
        averageOrder:
          paidOrders.length === 0
            ? 0
            : Math.round((revenue / paidOrders.length) * 100) / 100,
        projectedRevenue14d:
          Math.round(
            projectedRevenue.reduce((sum, row) => sum + row.amount, 0) * 100,
          ) / 100,
      },
      revenueByDay,
      projectedRevenue,
      statusBreakdown,
      topProducts,
      fastestSelling: predictions.slice(0, 8),
      inDemand: predictions.filter((row) => row.demand === 'hot').slice(0, 8),
      predictions,
      model: {
        name: 'Ordinary least squares trend + exponential smoothing',
        description:
          'Each product gets a linear units-per-day slope from completed (non-cancelled) order lines. Shop-wide revenue uses OLS plus a light exponential smoother. Labels: hot (rising), steady, cooling. This is a teaching-scale model, not a production recommender.',
        horizonDays: HORIZON_DAYS,
        sampleDays: allDays.length,
      },
    };
  }
}
