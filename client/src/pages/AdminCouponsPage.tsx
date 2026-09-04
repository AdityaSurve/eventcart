import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getErrorMessage } from '../lib/api'
import type { Coupon, CouponType } from '../types'

export function AdminCouponsPage() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [type, setType] = useState<CouponType>('PERCENT')
  const [value, setValue] = useState('10')
  const [minSubtotal, setMinSubtotal] = useState('20')
  const [error, setError] = useState('')

  const couponsQuery = useQuery({
    queryKey: ['coupons'],
    queryFn: async () => (await api.get<Coupon[]>('/coupons')).data,
  })

  const createCoupon = useMutation({
    mutationFn: async () => {
      await api.post('/coupons', {
        code: code.trim().toUpperCase(),
        type,
        value: Number(value),
        minSubtotal: minSubtotal ? Number(minSubtotal) : undefined,
      })
    },
    onSuccess: async () => {
      setCode('')
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['coupons'] })
    },
    onError: (err) => setError(getErrorMessage(err)),
  })

  const removeCoupon = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/coupons/${id}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['coupons'] })
    },
  })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Coupons</h1>
        <div className="flex gap-4 text-sm">
          <Link to="/admin/products" className="text-ticket">
            Products
          </Link>
          <Link to="/admin/orders" className="text-ticket">
            Orders
          </Link>
        </div>
      </div>

      <form
        className="mt-6 grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          createCoupon.mutate()
        }}
      >
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          placeholder="CODE"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
        />
        <select
          className="rounded-lg border border-stone-300 px-3 py-2"
          value={type}
          onChange={(e) => setType(e.target.value as CouponType)}
        >
          <option value="PERCENT">Percent</option>
          <option value="FIXED">Fixed $</option>
        </select>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="number"
          min="0.01"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="number"
          min="0"
          step="0.01"
          placeholder="Min subtotal"
          value={minSubtotal}
          onChange={(e) => setMinSubtotal(e.target.value)}
        />
        <button
          type="submit"
          disabled={createCoupon.isPending}
          className="rounded-lg bg-ticket px-4 py-2 text-white hover:bg-ticket-dark"
        >
          Create
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Uses</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(couponsQuery.data ?? []).map((coupon) => (
              <tr key={coupon.id} className="border-b border-stone-100">
                <td className="px-4 py-3 font-medium">{coupon.code}</td>
                <td className="px-4 py-3">{coupon.type}</td>
                <td className="px-4 py-3">
                  {coupon.type === 'PERCENT' ? `${coupon.value}%` : `$${coupon.value}`}
                </td>
                <td className="px-4 py-3">
                  {coupon.usedCount}
                  {coupon.maxUses != null ? ` / ${coupon.maxUses}` : ''}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() => removeCoupon.mutate(coupon.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
