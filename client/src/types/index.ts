export type Role = 'CUSTOMER' | 'ADMIN'

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'

export type User = {
  id: string
  name: string
  email: string
  role: Role
  hasPassword?: boolean
  hasGoogle?: boolean
  createdAt: string
  updatedAt: string
}

export type AuthResponse = {
  accessToken?: string
  user: User
}

export type AnalyticsOverview = {
  kpis: {
    orders: number
    paidOrders: number
    cancelledOrders: number
    revenue: number
    averageOrder: number
    projectedRevenue14d: number
  }
  revenueByDay: { date: string; revenue: number; orders: number }[]
  projectedRevenue: { dayOffset: number; amount: number }[]
  statusBreakdown: { status: string; count: number }[]
  topProducts: { name: string; slug: string; unitsSold: number; projectedRevenue14d: number }[]
  fastestSelling: ProductPrediction[]
  inDemand: ProductPrediction[]
  predictions: ProductPrediction[]
  model: {
    name: string
    description: string
    horizonDays: number
    sampleDays: number
  }
}

export type ProductPrediction = {
  productId: string
  name: string
  slug: string
  stock: number
  unitsSold: number
  recentUnits7d: number
  previousUnits7d: number
  velocityPerDay: number
  demand: 'hot' | 'steady' | 'cooling'
  projectedUnits14d: number
  projectedRevenue14d: number
}

export type Product = {
  id: string
  name: string
  slug: string
  description: string | null
  price: number
  stock: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type Paginated<T> = {
  items: T[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export type CartItem = {
  productId: string
  quantity: number
  unitPrice: number
  lineTotal: number
  product: {
    id: string
    name: string
    slug: string
    stock: number
  }
}

export type Cart = {
  items: CartItem[]
  subtotal: number
}

export type OrderItem = {
  id: string
  quantity: number
  unitPrice: number
  lineTotal: number
  productId: string
  product: {
    id: string
    name: string
    slug: string
  }
}

export type OrderStatusHistory = {
  id: string
  status: OrderStatus
  note: string | null
  createdAt: string
  changedBy: {
    id: string
    name: string
    email: string
  } | null
}

export type Order = {
  id: string
  orderNumber: string
  status: OrderStatus
  subtotal: number
  total: number
  userId: string
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name: string
    email: string
  }
  items: OrderItem[]
  statusHistory: OrderStatusHistory[]
}
