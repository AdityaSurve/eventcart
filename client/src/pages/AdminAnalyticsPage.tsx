import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../lib/api'
import { formatMoney } from '../lib/money'
import type { AnalyticsOverview } from '../types'

const PIE_COLORS = ['#c45c26', '#1c1917', '#78716c', '#a8a29e', '#d6d3d1', '#9a3f14']

function demandClass(demand: string) {
  if (demand === 'hot') return 'text-green-700'
  if (demand === 'cooling') return 'text-amber-700'
  return 'text-stone-600'
}

export function AdminAnalyticsPage() {
  const query = useQuery({
    queryKey: ['analytics'],
    queryFn: async () => (await api.get<AnalyticsOverview>('/analytics')).data,
  })

  if (query.isLoading) {
    return <p className="text-stone-500">Loading analytics…</p>
  }

  if (query.error || !query.data) {
    return <p className="text-red-600">Could not load analytics.</p>
  }

  const data = query.data
  const projectedSeries = [
    ...data.revenueByDay.map((row) => ({
      label: row.date.slice(5),
      actual: row.revenue,
      projected: null as number | null,
    })),
    ...data.projectedRevenue.map((row) => ({
      label: `+${row.dayOffset}d`,
      actual: null as number | null,
      projected: row.amount,
    })),
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Analytics</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">{data.model.description}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link className="text-ticket" to="/admin/products">
            Products
          </Link>
          <Link className="text-ticket" to="/admin/orders">
            Orders
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Revenue" value={formatMoney(data.kpis.revenue)} />
        <Kpi label="Paid orders" value={String(data.kpis.paidOrders)} />
        <Kpi label="Average order" value={formatMoney(data.kpis.averageOrder)} />
        <Kpi
          label={`Projected ${data.model.horizonDays}d`}
          value={formatMoney(data.kpis.projectedRevenue14d)}
        />
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 font-medium">Revenue and 14-day projection</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projectedSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="actual" name="Actual" stroke="#c45c26" dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="projected" name="Projected" stroke="#1c1917" strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 font-medium">Top products by units</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topProducts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="unitsSold" fill="#c45c26" name="Units sold" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 font-medium">Order status mix</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.statusBreakdown.filter((row) => row.count > 0)}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={50}
                  outerRadius={90}
                >
                  {data.statusBreakdown.map((row, index) => (
                    <Cell key={row.status} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium">Demand model (OLS velocity)</h2>
        <p className="mt-1 text-sm text-stone-500">
          Trained on {data.model.sampleDays} day(s) of paid order lines. More orders make the slope more meaningful.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="py-2">Product</th>
                <th>Units</th>
                <th>7d</th>
                <th>Velocity / day</th>
                <th>Demand</th>
                <th>14d units</th>
                <th>14d revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.predictions.map((row) => (
                <tr key={row.productId} className="border-b border-stone-100">
                  <td className="py-2">{row.name}</td>
                  <td>{row.unitsSold}</td>
                  <td>{row.recentUnits7d}</td>
                  <td>{row.velocityPerDay}</td>
                  <td className={demandClass(row.demand)}>{row.demand}</td>
                  <td>{row.projectedUnits14d}</td>
                  <td>{formatMoney(row.projectedRevenue14d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}
