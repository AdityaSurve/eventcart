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

export type Category = {
  id: string
  name: string
  slug: string
  _count?: { products: number }
}

export type CouponType = 'PERCENT' | 'FIXED'

export type Coupon = {
  id: string
  code: string
  type: CouponType
  value: number
  minSubtotal: number | null
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  isActive: boolean
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
  imageUrl?: string | null
  price: number
  stock: number
  isActive: boolean
  categoryId?: string | null
  category?: { id: string; name: string; slug: string } | null
  avgRating?: number | null
  reviewCount?: number
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
    imageUrl?: string | null
  }
}

export type Cart = {
  items: CartItem[]
  subtotal: number
  discount?: number
  total?: number
  couponCode?: string | null
  coupon?: {
    code: string
    type: string
    value: number
    discount: number
  } | null
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
    imageUrl?: string | null
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

export type PaymentStatus = 'UNPAID' | 'PAID' | 'FAILED' | 'REFUNDED'

export type Order = {
  id: string
  orderNumber: string
  status: OrderStatus
  paymentStatus?: PaymentStatus
  paymentProvider?: string | null
  paymentRef?: string | null
  subtotal: number
  discount?: number
  total: number
  couponCode?: string | null
  guestEmail?: string | null
  guestName?: string | null
  userId: string | null
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name: string
    email: string
  } | null
  items: OrderItem[]
  statusHistory: OrderStatusHistory[]
}

export type Review = {
  id: string
  rating: number
  body: string | null
  createdAt: string
  updatedAt: string
  user: { id: string; name: string }
}

export type ReviewsResponse = {
  items: Review[]
  avgRating: number | null
  reviewCount: number
}

export type WishlistResponse = {
  items: {
    id: string
    productId: string
    createdAt: string
    product: {
      id: string
      name: string
      slug: string
      price: number
      stock: number
      isActive: boolean
      imageUrl?: string | null
    }
  }[]
}

export type LowStockResponse = {
  threshold: number
  count: number
  items: Product[]
}
