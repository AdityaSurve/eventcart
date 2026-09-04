import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FiSearch, FiStar } from 'react-icons/fi'
import { api } from '../lib/api'
import { productImage } from '../lib/media'
import { formatMoney } from '../lib/money'
import type { Category, Paginated, Product } from '../types'

type Sort = 'newest' | 'price_asc' | 'price_desc' | 'name'

export function ProductsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [categorySlug, setCategorySlug] = useState<string>('')
  const [sort, setSort] = useState<Sort>('newest')

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/categories')).data,
  })

  const productsQuery = useQuery({
    queryKey: ['products', search, page, categorySlug, sort],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Product>>('/products', {
        params: {
          page,
          limit: 12,
          isActive: true,
          search: search || undefined,
          categorySlug: categorySlug || undefined,
          sort,
        },
      })
      return data
    },
  })

  const products = productsQuery.data?.items ?? []
  const meta = productsQuery.data?.meta
  const categories = categoriesQuery.data ?? []

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

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Catalog</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setCategorySlug('')
                setPage(1)
              }}
              className={
                !categorySlug
                  ? 'rounded-full bg-ink px-3 py-1.5 text-sm text-white'
                  : 'rounded-full border border-line px-3 py-1.5 text-sm text-muted hover:text-ink'
              }
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setCategorySlug(category.slug)
                  setPage(1)
                }}
                className={
                  categorySlug === category.slug
                    ? 'rounded-full bg-ink px-3 py-1.5 text-sm text-white'
                    : 'rounded-full border border-line px-3 py-1.5 text-sm text-muted hover:text-ink'
                }
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            className="rounded-full border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-ticket"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort)
              setPage(1)
            }}
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="name">Name</option>
          </select>
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
              {product.category ? (
                <p className="text-xs uppercase tracking-wider text-muted">
                  {product.category.name}
                </p>
              ) : null}
              <h3 className="font-display text-xl font-semibold">{product.name}</h3>
              <p className="mt-2 line-clamp-2 text-sm text-muted">
                {product.description ?? 'No description'}
              </p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="font-semibold">{formatMoney(product.price)}</span>
                <span className="flex items-center gap-2 text-muted">
                  {product.reviewCount ? (
                    <span className="inline-flex items-center gap-1">
                      <FiStar className="text-ticket" />
                      {product.avgRating?.toFixed(1)}
                    </span>
                  ) : null}
                  {product.stock} left
                </span>
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
