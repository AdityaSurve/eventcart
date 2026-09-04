import { OrderStatus } from '../generated/prisma/enums';

export type OrderPlacedEvent = {
  orderId: string;
  orderNumber: string;
  userId: string | null;
  total: number;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  timestamp: string;
};

export type OrderStatusChangedEvent = {
  orderId: string;
  orderNumber: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  changedById: string | null;
  note?: string;
  timestamp: string;
};
