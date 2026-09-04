import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FiHeart, FiTrash2 } from 'react-icons/fi'
import { api, getErrorMessage } from '../lib/api'
import { productImage } from '../lib/media'
import { formatMoney } from '../lib/money'
import type { WishlistResponse } from '../types'

export function WishlistPage() {
  const queryClient = useQueryClient()

  const wishlistQuery = useQuery({
    queryKey: ['wishlist'],
    queryFn: async () => (await api.get<WishlistResponse>('/wishlist')).data,
  })

  const remove = useMutation({
    mutationFn: async (productId: string) => {
      await api.delete(`/wishlist/${productId}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['wishlist'] })
    },
  })

  const addToCart = useMutation({
    mutationFn: async (productId: string) => {
      await api.post('/cart/items', { productId, quantity: 1 })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const items = wishlistQuery.data?.items ?? []

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Wishlist</h1>
      {wishlistQuery.isLoading ? <p className="mt-4 text-muted">Loading…</p> : null}
      {!wishlistQuery.isLoading && items.length === 0 ? (
        <p className="mt-4 text-muted">
          No saved items yet. Browse the{' '}
          <Link to="/" className="text-ticket">
            shop
          </Link>
          .
        </p>
      ) : null}
      <ul className="mt-6 space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="surface flex flex-col gap-4 rounded-3xl p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <Link to={`/products/${item.product.slug}`} className="flex items-center gap-4">
              <img
                src={productImage(item.product.slug, item.product.imageUrl)}
                alt=""
                className="h-16 w-16 rounded-2xl object-cover"
              />
              <div>
                <p className="font-medium">{item.product.name}</p>
                <p className="text-sm text-muted">{formatMoney(item.product.price)}</p>
              </div>
            </Link>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={!item.product.isActive || addToCart.isPending}
                onClick={() => addToCart.mutate(item.productId)}
              >
                Add to cart
              </button>
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => remove.mutate(item.productId)}
              >
                <FiTrash2 />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {remove.isError || addToCart.isError ? (
        <p className="mt-3 text-sm text-red-600">
          {getErrorMessage(remove.error ?? addToCart.error)}
        </p>
      ) : null}
      <p className="mt-6 inline-flex items-center gap-2 text-sm text-muted">
        <FiHeart /> Saved to your account
      </p>
    </div>
  )
}
