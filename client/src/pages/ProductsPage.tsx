import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FiSearch } from 'react-icons/fi'
import { api } from '../lib/api'
import { productImage } from '../lib/media'
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
      <section className="relative overflow-hidden rounded-[1.75rem] border border-line bg-[#1c1713] px-5 py-10 text-[#f7f1e8] sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(196,92,38,0.35),transparent_40%),radial-gradient(circle_at_10%_80%,rgba(47,93,80,0.3),transparent_35%)]" />
        <div className="relative max-w-xl">
          <p className="text-sm uppercase tracking-[0.2em] text-white/60">Event merch</p>
          <h1 className="font-display mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
            Wear the night.
          </h1>
          <p className="mt-4 text-base text-white/70 sm:text-lg">
            Soft tees, loud totes, and keepers from the floor — browse the live catalog.
          </p>
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-2xl font-semibold">Catalog</h2>
        <label className="relative block w-full sm:w-72">
          <FiSearch className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            className="w-full rounded-full border border-line bg-surface py-2.5 pr-4 pl-10 text-sm outline-none focus:border-ticket"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search merch…"
          />
        </label>
      </div>

      {productsQuery.isLoading ? (
        <p className="mt-8 text-muted">Loading products…</p>
      ) : null}
      {productsQuery.isError ? (
        <p className="mt-8 text-red-600">Could not load products. Is the API running?</p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <Link
            key={product.id}
            to={`/products/${product.slug}`}
            className="surface group overflow-hidden rounded-3xl transition duration-200 hover:-translate-y-1"
          >
            <div className="aspect-[4/3] overflow-hidden bg-line">
              <img
                src={productImage(product.slug, product.imageUrl)}
                alt={product.name}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                loading="lazy"
              />
            </div>
            <div className="p-5">
              <h3 className="font-display text-xl font-semibold">{product.name}</h3>
              <p className="mt-2 line-clamp-2 text-sm text-muted">
                {product.description ?? 'No description'}
              </p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="font-semibold">{formatMoney(product.price)}</span>
                <span className="text-muted">{product.stock} left</span>
              </div>
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
            className="btn-ghost disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-muted">
            Page {meta.page} of {meta.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-ghost disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}
