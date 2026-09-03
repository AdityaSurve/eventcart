import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FiArrowLeft, FiShoppingCart } from 'react-icons/fi'
import { useAuth } from '../hooks/useAuth'
import { api, getErrorMessage } from '../lib/api'
import { productImage } from '../lib/media'
import { formatMoney } from '../lib/money'
import type { Product } from '../types'

export function ProductDetailPage() {
  const { slug } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState('')

  const productQuery = useQuery({
    queryKey: ['product', slug],
    queryFn: async () => (await api.get<Product>(`/products/slug/${slug}`)).data,
    enabled: Boolean(slug),
  })

  const addToCart = useMutation({
    mutationFn: async () => {
      if (!productQuery.data) return
      await api.post('/cart/items', {
        productId: productQuery.data.id,
        quantity,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
      setMessage('Added to cart')
    },
  })

  const product = productQuery.data

  if (productQuery.isLoading) {
    return <p className="text-muted">Loading…</p>
  }

  if (!product) {
    return <p className="text-red-600">Product not found.</p>
  }

  return (
    <div className="surface overflow-hidden rounded-[1.75rem]">
      <div className="grid gap-0 lg:grid-cols-2">
        <div className="aspect-[4/3] bg-line lg:aspect-auto lg:min-h-[28rem]">
          <img
            src={productImage(product.slug, product.imageUrl)}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col justify-center p-6 sm:p-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-ticket">
            <FiArrowLeft /> Back to shop
          </Link>
          <h1 className="font-display mt-4 text-3xl font-semibold sm:text-4xl">
            {product.name}
          </h1>
          <p className="mt-3 text-muted">{product.description ?? 'No description'}</p>
          <p className="mt-6 text-2xl font-semibold">{formatMoney(product.price)}</p>
          <p className="mt-1 text-sm text-muted">{product.stock} in stock</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={1}
              max={product.stock}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-20 rounded-full border border-line bg-white px-3 py-2"
            />
            <button
              type="button"
              disabled={addToCart.isPending || product.stock < 1}
              onClick={() => {
                if (!user) {
                  navigate('/login', { state: { from: `/products/${product.slug}` } })
                  return
                }
                addToCart.mutate()
              }}
              className="btn-primary"
            >
              <FiShoppingCart />
              {addToCart.isPending ? 'Adding…' : 'Add to cart'}
            </button>
          </div>
          {message ? <p className="mt-3 text-sm text-pine">{message}</p> : null}
          {addToCart.isError ? (
            <p className="mt-3 text-sm text-red-600">{getErrorMessage(addToCart.error)}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
