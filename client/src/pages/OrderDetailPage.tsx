import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FiArrowLeft, FiXCircle } from 'react-icons/fi'
import { useParams, useSearchParams } from 'react-router-dom'
import { api, getErrorMessage } from '../lib/api'
import { productImage, statusTone } from '../lib/media'
import { formatMoney } from '../lib/money'
import type { Order } from '../types'

export function OrderDetailPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const queryClient = useQueryClient()

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: async () => (await api.get<Order>(`/orders/${id}`)).data,
    enabled: Boolean(id),
  })

  const cancel = useMutation({
    mutationFn: async () => (await api.post<Order>(`/orders/${id}/cancel`)).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['order', id] })
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  const order = orderQuery.data

  if (orderQuery.isLoading) {
    return <p className="text-muted">Loading order…</p>
  }

  if (!order) {
    return <p className="text-red-600">Order not found.</p>
  }

  const canCancel =
    order.status === 'PENDING' || order.status === 'CONFIRMED'

  return (
    <div className="surface rounded-[1.75rem] p-6 sm:p-8">
      <Link to="/orders" className="inline-flex items-center gap-2 text-sm text-ticket">
        <FiArrowLeft /> All orders
      </Link>
      {params.get('paid') ? (
        <p className="mt-3 text-sm text-pine">Payment received. Status updates live.</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            {order.orderNumber}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="status-pill" data-tone={statusTone(order.status)}>
              {order.status}
            </span>
            {order.paymentStatus ? (
              <span className="status-pill" data-tone={statusTone(order.paymentStatus)}>
                {order.paymentStatus}
                {order.paymentProvider ? ` · ${order.paymentProvider}` : ''}
              </span>
            ) : null}
          </div>
          <p className="mt-3 font-semibold">Total {formatMoney(order.total)}</p>
        </div>
        {canCancel ? (
          <button
            type="button"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
            className="btn-ghost text-sm"
          >
            <FiXCircle />
            {cancel.isPending ? 'Cancelling…' : 'Cancel order'}
          </button>
        ) : null}
      </div>
      {cancel.isError ? (
        <p className="mt-3 text-sm text-red-600">{getErrorMessage(cancel.error)}</p>
      ) : null}

      <h2 className="mt-8 font-medium">Items</h2>
      <ul className="mt-3 space-y-3">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-3">
              <img
                src={productImage(item.product.slug, item.product.imageUrl)}
                alt=""
                className="h-12 w-12 rounded-xl object-cover"
              />
              <span>
                {item.product.name} × {item.quantity}
              </span>
            </div>
            <span>{formatMoney(item.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 font-medium">Status timeline</h2>
      <p className="mt-1 text-sm text-muted">Updates appear automatically — no refresh needed.</p>
      <ol className="mt-3 space-y-3 border-l border-line pl-4">
        {order.statusHistory.map((entry) => (
          <li key={entry.id}>
            <p className="font-medium">{entry.status}</p>
            <p className="text-sm text-muted">
              {new Date(entry.createdAt).toLocaleString()}
              {entry.note ? ` — ${entry.note}` : ''}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}
