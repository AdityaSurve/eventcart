import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatMoney } from '../lib/money'
import type { Paginated, Product } from '../types'

export function ProductsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const productsQuery = useQuery({
    queryKey: ['products', search, page],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>('/products', {
        params: {
          page,
          limit: 12,
          isActive: true,
          search: search || undefined,
        },
      })
      return data
    },
  })

  const products = productsQuery.data?.items ?? []
  const meta = productsQuery.data?.meta

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Event merch</h1>
          <p className="mt-1 text-stone-500">Browse the catalog from your Nest API.</p>
        </div>
        <label className="text-sm">
          Search
          <input
            className="mt-1 block w-64 rounded-lg border border-stone-300 bg-white px-3 py-2"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="mug, t-shirt…"
          />
        </label>
      </div>

      {productsQuery.isLoading ? (
        <p className="mt-8 text-stone-500">Loading products…</p>
      ) : null}
      {productsQuery.isError ? (
        <p className="mt-8 text-red-600">Could not load products. Is the API running?</p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <Link
            key={product.id}
            to={`/products/${product.slug}`}
            className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <h2 className="text-lg font-medium">{product.name}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-stone-500">
              {product.description ?? 'No description'}
            </p>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="font-semibold">{formatMoney(product.price)}</span>
              <span className="text-stone-400">{product.stock} in stock</span>
            </div>
          </Link>
        ))}
      </div>

      {meta && meta.totalPages > 1 ? (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-stone-300 px-3 py-1.5 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-stone-500">
            Page {meta.page} of {meta.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-stone-300 px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}
