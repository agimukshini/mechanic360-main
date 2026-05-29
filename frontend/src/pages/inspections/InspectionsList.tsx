import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import {
  ClipboardCheck,
  Search,
  Calendar,
  Car,
  User,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
} from 'lucide-react'
import { useState } from 'react'

export default function InspectionsList() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['inspections', search],
    queryFn: () => api.get('/inspections/', { params: { search } }),
  })

  const inspections = data?.data?.results || data?.data || []

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />
      case 'fail':
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'warning':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      case 'fail':
        return 'bg-red-50 text-red-700 border-red-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('inspectionsList.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('inspectionsList.subtitle')}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={t('inspectionsList.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-12 bg-gray-50 border-0"
            />
          </div>
        </div>
      </div>

      {/* Inspections List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
        </div>
      ) : inspections.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {inspections.map((inspection: any) => (
            <Link
              key={inspection.id}
              to={`/inspections/${inspection.id}`}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ClipboardCheck className="w-6 h-6 text-brand-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900">
                        {inspection.visit?.vehicle?.make} {inspection.visit?.vehicle?.model}
                      </h3>
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                        {inspection.visit?.vehicle?.license_plate}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">
                          {new Date(inspection.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">
                          {inspection.inspector?.username || t('inspectionsList.unknown')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Car className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">
                          {inspection.visit?.mileage_km?.toLocaleString() || 0} mi
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <ClipboardCheck className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">
                          {t('inspectionsList.itemsChecked', { count: inspection.items?.length || 0 })}
                        </span>
                      </div>
                    </div>

                    {/* Inspection Items Summary */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {inspection.items?.slice(0, 5).map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className={`px-2.5 py-1 text-xs font-medium rounded-full border ${getStatusColor(item.status)}`}
                        >
                          <div className="flex items-center gap-1">
                            {getStatusIcon(item.status)}
                            <span className="hidden sm:inline">{item.name}</span>
                          </div>
                        </div>
                      ))}
                      {inspection.items?.length > 5 && (
                        <span className="text-xs text-gray-500">
                          {t('inspectionsList.moreItems', { count: inspection.items.length - 5 })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                    inspection.overall_status === 'pass' ? 'bg-green-100 text-green-700' :
                    inspection.overall_status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {inspection.overall_status === 'pass'
                      ? t('inspectionsList.statusPassed')
                      : inspection.overall_status === 'warning'
                        ? t('inspectionsList.statusAttention')
                        : t('inspectionsList.statusFailed')}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <ClipboardCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('inspectionsList.empty')}</h3>
          <p className="text-gray-500 mb-6">
            {t('inspectionsList.emptyHint')}
          </p>
          <Link to="/visits" className="btn btn-primary">
            {t('inspectionsList.goToVisits')}
          </Link>
        </div>
      )}
    </div>
  )
}
