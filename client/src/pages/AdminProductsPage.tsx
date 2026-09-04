import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getErrorMessage } from '../lib/api'
import { formatMoney } from '../lib/money'
import type { Category, LowStockResponse, Paginated, Product } from '../types'

export function AdminProductsPage() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [price, setPrice] = useState('19.99')
  const [stock, setStock] = useState('20')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState('')

  const productsQuery = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () =>
      (await api.get<Paginated<Product>>('/products', { params: { limit: 50 } })).data,
  })

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/categories')).data,
  })

  const lowStockQuery = useQuery({
    queryKey: ['low-stock'],
    queryFn: async () => (await api.get<LowStockResponse>('/products/low-stock')).data,
  })

  const createProduct = useMutation({
    mutationFn: async () => {
      await api.post('/products', {
        name,
        slug,
        price: Number(price),
        stock: Number(stock),
        categoryId: categoryId || undefined,
      })
    },
    onSuccess: async () => {
      setName('')
      setSlug('')
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['low-stock'] })
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    createProduct.mutate()
  }

  const lowStock = lowStockQuery.data

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Admin products</h1>
        <div className="flex gap-4 text-sm">
          <Link to="/admin/analytics" className="text-ticket">
            Analytics
          </Link>
          <Link to="/admin/coupons" className="text-ticket">
            Coupons
          </Link>
          <Link to="/admin/orders" className="text-ticket">
            Orders
          </Link>
        </div>
      </div>

      {lowStock && lowStock.count > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Low stock alert: {lowStock.count} product
          {lowStock.count === 1 ? '' : 's'} at or below {lowStock.threshold} units —{' '}
          {lowStock.items.map((item) => `${item.name} (${item.stock})`).join(', ')}
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="mt-6 grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          placeholder="kebab-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
        />
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="number"
          min="0.01"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="number"
          min="0"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          required
        />
        <select
          className="rounded-lg border border-stone-300 px-3 py-2"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">No category</option>
          {(categoriesQuery.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={createProduct.isPending}
          className="rounded-lg bg-ticket px-4 py-2 text-white hover:bg-ticket-dark"
        >
          Create
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <table className="mt-6 w-full overflow-hidden rounded-xl border border-stone-200 bg-white text-left text-sm">
        <thead className="bg-stone-50">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Price</th>
            <th className="px-3 py-2">Stock</th>
            <th className="px-3 py-2">Active</th>
          </tr>
        </thead>
        <tbody>
          {(productsQuery.data?.items ?? []).map((product) => (
            <tr
              key={product.id}
              className={`border-t border-stone-100 ${
                lowStock && product.stock <= lowStock.threshold ? 'bg-amber-50' : ''
              }`}
            >
              <td className="px-3 py-2">{product.name}</td>
              <td className="px-3 py-2">{product.category?.name ?? '—'}</td>
              <td className="px-3 py-2">{formatMoney(product.price)}</td>
              <td className="px-3 py-2">{product.stock}</td>
              <td className="px-3 py-2">{product.isActive ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
