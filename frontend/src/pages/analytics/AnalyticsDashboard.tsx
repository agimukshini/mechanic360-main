import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { visitsApi } from '@/api'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import {
  TrendingUp, DollarSign, Package, AlertTriangle, Calendar,
  BarChart3, Clock
} from 'lucide-react'

const COLORS = ['#0077B6', '#00B4D8', '#1B263B', '#90E0EF', '#CAF0F8']

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month')

  const { data: statsData } = useQuery({
    queryKey: ['analytics-stats'],
    queryFn: () => visitsApi.analytics.dashboardStats(),
  })

  const { data: visitsData } = useQuery({
    queryKey: ['analytics-visits', period],
    queryFn: () => visitsApi.analytics.visitsOverview({ period }),
  })

  const { data: revenueData } = useQuery({
    queryKey: ['analytics-revenue'],
    queryFn: () => visitsApi.analytics.revenueBreakdown(),
  })

  const { data: partsData } = useQuery({
    queryKey: ['analytics-parts'],
    queryFn: () => visitsApi.analytics.partsConsumption(),
  })

  const { data: forecastData } = useQuery({
    queryKey: ['analytics-forecast'],
    queryFn: () => visitsApi.analytics.maintenanceForecast(),
  })

  const stats = statsData?.data
  const visits = visitsData?.data || []
  const revenue = revenueData?.data
  const parts = partsData?.data || []
  const forecast = forecastData?.data || []

  const statusData = stats?.visits_by_status ? Object.entries(stats.visits_by_status).map(([name, value]) => ({
    name: name.replace('_', ' '),
    value,
  })) : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">Analytics Dashboard</h1>
          <p className="text-workshop-charcoal/60 mt-1">
            Overview of workshop performance and metrics
          </p>
        </div>
        <div className="flex gap-2">
          {(['day', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`btn ${period === p ? 'btn-primary' : 'btn-outline'}`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-workshop-charcoal/60">Total Vehicles</p>
              <p className="text-3xl font-bold text-workshop-charcoal mt-2">
                {stats?.total_vehicles || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-workshop-blue/10 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-workshop-blue" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-workshop-charcoal/60">Total Visits</p>
              <p className="text-3xl font-bold text-workshop-charcoal mt-2">
                {stats?.total_visits || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-workshop-cyan/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-workshop-cyan" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-workshop-charcoal/60">Recent Visits (7d)</p>
              <p className="text-3xl font-bold text-workshop-charcoal mt-2">
                {stats?.recent_visits || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-workshop-charcoal/60">Low Stock Items</p>
              <p className="text-3xl font-bold text-red-600 mt-2">
                {stats?.low_stock_items || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Visits Over Time */}
        <div className="card p-6">
          <h2 className="font-semibold text-workshop-charcoal mb-4">Visits Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={visits}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#0077B6" name="Total Visits" />
              <Line type="monotone" dataKey="completed" stroke="#22c55e" name="Completed" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Visits by Status */}
        <div className="card p-6">
          <h2 className="font-semibold text-workshop-charcoal mb-4">Visits by Status</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Service */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-workshop-blue" />
            <h2 className="font-semibold text-workshop-charcoal">Revenue by Service</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenue?.services?.slice(0, 10) || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="description" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
              <Legend />
              <Bar dataKey="total" fill="#0077B6" name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Parts Consumption */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-workshop-cyan" />
            <h2 className="font-semibold text-workshop-charcoal">Top Parts Consumed</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={parts.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="inventory_item__name" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total_used" fill="#00B4D8" name="Quantity Used" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Maintenance Forecast */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-workshop-charcoal" />
          <h2 className="font-semibold text-workshop-charcoal">Preventive Maintenance Forecast</h2>
        </div>
        {forecast.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-workshop-charcoal/10">
                  <th className="text-left py-3 px-4 text-sm font-medium text-workshop-charcoal/60">Plan</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-workshop-charcoal/60">Vehicle</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-workshop-charcoal/60">Owner</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-workshop-charcoal/60">Next Due</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((item: any) => (
                  <tr key={item.plan_id} className="border-b border-workshop-charcoal/5">
                    <td className="py-3 px-4 text-sm font-medium">{item.plan_name}</td>
                    <td className="py-3 px-4 text-sm">{item.vehicle}</td>
                    <td className="py-3 px-4 text-sm">{item.owner}</td>
                    <td className="py-3 px-4 text-sm">
                      <span className={`badge ${
                        item.next_due === 'Overdue' ? 'badge-danger' : 'badge-info'
                      }`}>
                        {item.next_due}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-workshop-charcoal/40 py-8">No maintenance plans configured</p>
        )}
      </div>
    </div>
  )
}
