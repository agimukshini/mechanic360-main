import { useQuery } from '@tanstack/react-query'
import { visitsApi } from '@/api'
import { Clock, AlertTriangle, CheckCircle, Calendar } from 'lucide-react'

export default function MaintenanceReminders() {
  const { data: forecastData, isLoading } = useQuery({
    queryKey: ['maintenance-forecast'],
    queryFn: () => visitsApi.analytics.maintenanceForecast(),
  })

  const forecast = forecastData?.data || []

  if (isLoading) {
    return <div className="p-4 text-center text-workshop-charcoal/40">Loading...</div>
  }

  const overdue = forecast.filter((item: any) => item.next_due === 'Overdue')
  const upcoming = forecast.filter((item: any) => item.next_due !== 'Overdue' && item.next_due !== 'Not scheduled')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-workshop-charcoal flex items-center gap-2">
          <Clock className="w-5 h-5 text-workshop-blue" />
          Maintenance Reminders
        </h3>
        <span className="badge badge-info">{forecast.length} plans</span>
      </div>

      {forecast.length === 0 ? (
        <div className="text-center py-8 text-workshop-charcoal/40">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No maintenance plans configured</p>
        </div>
      ) : (
        <>
          {/* Overdue */}
          {overdue.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-red-600 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Overdue ({overdue.length})
              </h4>
              <div className="space-y-2">
                {overdue.map((item: any) => (
                  <div key={item.plan_id} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="font-medium text-red-700">{item.plan_name}</p>
                    <p className="text-sm text-red-600">{item.vehicle}</p>
                    <p className="text-xs text-red-500 mt-1">{item.next_due}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-workshop-blue mb-2 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Upcoming ({upcoming.length})
              </h4>
              <div className="space-y-2">
                {upcoming.slice(0, 5).map((item: any) => (
                  <div key={item.plan_id} className="p-3 bg-workshop-blue/5 border border-workshop-blue/20 rounded-lg">
                    <p className="font-medium text-workshop-charcoal">{item.plan_name}</p>
                    <p className="text-sm text-workshop-charcoal/60">{item.vehicle}</p>
                    <p className="text-xs text-workshop-blue mt-1">{item.next_due}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
