import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { api, getErrorMessage } from '../lib/api'
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
    return <p className="text-stone-500">Loading…</p>
  }

  if (!product) {
    return <p className="text-red-600">Product not found.</p>
  }

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-stone-200 bg-white p-6">
      <Link to="/" className="text-sm text-ticket">
        ← Back to shop
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">{product.name}</h1>
      <p className="mt-3 text-stone-600">{product.description ?? 'No description'}</p>
      <p className="mt-4 text-xl font-semibold">{formatMoney(product.price)}</p>
      <p className="mt-1 text-sm text-stone-500">{product.stock} in stock</p>

      <div className="mt-6 flex items-center gap-3">
        <input
          type="number"
          min={1}
          max={product.stock}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="w-20 rounded-lg border border-stone-300 px-3 py-2"
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
          className="rounded-lg bg-ticket px-4 py-2 font-medium text-white hover:bg-ticket-dark disabled:opacity-60"
        >
          {addToCart.isPending ? 'Adding…' : 'Add to cart'}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-green-700">{message}</p> : null}
      {addToCart.isError ? (
        <p className="mt-3 text-sm text-red-600">{getErrorMessage(addToCart.error)}</p>
      ) : null}
    </div>
  )
}
