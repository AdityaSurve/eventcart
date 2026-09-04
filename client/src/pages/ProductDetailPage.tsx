import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FiArrowLeft, FiHeart, FiShoppingCart, FiStar } from 'react-icons/fi'
import { useAuth } from '../hooks/useAuth'
import { api, getErrorMessage } from '../lib/api'
import { productImage } from '../lib/media'
import { formatMoney } from '../lib/money'
import type { Product, ReviewsResponse } from '../types'

export function ProductDetailPage() {
  const { slug } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState(5)
  const [reviewBody, setReviewBody] = useState('')

  const productQuery = useQuery({
    queryKey: ['product', slug],
    queryFn: async () => (await api.get<Product>(`/products/slug/${slug}`)).data,
    enabled: Boolean(slug),
  })

  const reviewsQuery = useQuery({
    queryKey: ['reviews', productQuery.data?.id],
    queryFn: async () =>
      (await api.get<ReviewsResponse>(`/products/${productQuery.data!.id}/reviews`))
        .data,
    enabled: Boolean(productQuery.data?.id),
  })

  const wishQuery = useQuery({
    queryKey: ['wishlist-status', productQuery.data?.id],
    queryFn: async () =>
      (
        await api.get<{ wished: boolean }>(
          `/wishlist/${productQuery.data!.id}/status`,
        )
      ).data,
    enabled: Boolean(user && productQuery.data?.id),
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

  const toggleWish = useMutation({
    mutationFn: async () => {
      if (!productQuery.data) return
      if (wishQuery.data?.wished) {
        await api.delete(`/wishlist/${productQuery.data.id}`)
      } else {
        await api.post(`/wishlist/${productQuery.data.id}`)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['wishlist-status', productQuery.data?.id],
      })
      await queryClient.invalidateQueries({ queryKey: ['wishlist'] })
    },
  })

  const submitReview = useMutation({
    mutationFn: async () => {
      if (!productQuery.data) return
      await api.post(`/products/${productQuery.data.id}/reviews`, {
        rating,
        body: reviewBody || undefined,
      })
    },
    onSuccess: async () => {
      setReviewBody('')
      await queryClient.invalidateQueries({
        queryKey: ['reviews', productQuery.data?.id],
      })
      await queryClient.invalidateQueries({ queryKey: ['product', slug] })
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
    <div className="space-y-8">
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
            {product.category ? (
              <p className="mt-4 text-xs uppercase tracking-wider text-muted">
                {product.category.name}
              </p>
            ) : null}
            <h1 className="font-display mt-2 text-3xl font-semibold sm:text-4xl">
              {product.name}
            </h1>
            <p className="mt-3 text-muted">{product.description ?? 'No description'}</p>
            <div className="mt-4 flex items-center gap-3 text-sm text-muted">
              {product.reviewCount ? (
                <span className="inline-flex items-center gap-1">
                  <FiStar className="text-ticket" />
                  {product.avgRating?.toFixed(1)} ({product.reviewCount})
                </span>
              ) : (
                <span>No reviews yet</span>
              )}
            </div>
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
                onClick={() => addToCart.mutate()}
                className="btn-primary"
              >
                <FiShoppingCart />
                {addToCart.isPending ? 'Adding…' : 'Add to cart'}
              </button>
              {user ? (
                <button
                  type="button"
                  disabled={toggleWish.isPending}
                  onClick={() => toggleWish.mutate()}
                  className="btn-ghost"
                >
                  <FiHeart
                    className={wishQuery.data?.wished ? 'fill-ticket text-ticket' : ''}
                  />
                  {wishQuery.data?.wished ? 'Saved' : 'Wishlist'}
                </button>
              ) : (
                <Link to="/login" className="btn-ghost text-sm">
                  Sign in to wishlist
                </Link>
              )}
            </div>
            {message ? <p className="mt-3 text-sm text-pine">{message}</p> : null}
            {addToCart.isError ? (
              <p className="mt-3 text-sm text-red-600">
                {getErrorMessage(addToCart.error)}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <section className="surface rounded-[1.75rem] p-6 sm:p-8">
        <h2 className="font-display text-2xl font-semibold">Reviews</h2>
        {user ? (
          <form
            className="mt-4 space-y-3 border-b border-line pb-6"
            onSubmit={(event: FormEvent) => {
              event.preventDefault()
              submitReview.mutate()
            }}
          >
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted">Rating</label>
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="rounded-full border border-line px-3 py-2 text-sm"
              >
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="w-full rounded-2xl border border-line px-3 py-2 text-sm"
              rows={3}
              placeholder="Share your thoughts (optional)"
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
            />
            <button
              type="submit"
              disabled={submitReview.isPending}
              className="btn-primary text-sm"
            >
              {submitReview.isPending ? 'Posting…' : 'Post review'}
            </button>
            {submitReview.isError ? (
              <p className="text-sm text-red-600">
                {getErrorMessage(submitReview.error)}
              </p>
            ) : null}
          </form>
        ) : (
          <p className="mt-3 text-sm text-muted">
            <Link to="/login" className="text-ticket">
              Sign in
            </Link>{' '}
            to leave a review.
          </p>
        )}

        <ul className="mt-6 space-y-4">
          {(reviewsQuery.data?.items ?? []).map((review) => (
            <li key={review.id} className="border-b border-line pb-4 last:border-0">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{review.user.name}</p>
                <span className="inline-flex items-center gap-1 text-sm text-muted">
                  <FiStar className="text-ticket" /> {review.rating}
                </span>
              </div>
              {review.body ? <p className="mt-2 text-sm text-muted">{review.body}</p> : null}
            </li>
          ))}
          {!reviewsQuery.data?.items.length ? (
            <p className="text-sm text-muted">No reviews yet.</p>
          ) : null}
        </ul>
      </section>
    </div>
  )
}
