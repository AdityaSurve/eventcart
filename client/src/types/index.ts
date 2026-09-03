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
  createdAt: string
  updatedAt: string
}

export type AuthResponse = {
  accessToken: string
  user: User
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
