import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { clientsApi, vehiclesApi } from '@/api'
import { UnderlineTabs } from '@/components/ui/PageTabs'
import {
  ArrowLeft,
  Edit2,
  Trash2,
  User,
  Phone,
  Mail,
  Building,
  Car,
  Calendar,
  ChevronRight,
} from 'lucide-react'

export default function ClientDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('overview')

  const { data: clientData, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => clientsApi.get(id!),
  })

  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles', { owner: id }],
    queryFn: () => vehiclesApi.list({ owner: id }),
  })

  const deleteMutation = useMutation({
    mutationFn: (clientId: string) => clientsApi.delete(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      navigate('/clients')
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const client = clientData?.data
  if (!client) return null

  const vehicles = vehiclesData?.data?.results || vehiclesData?.data || []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/clients" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-base font-semibold text-gray-900">{t('clients.profile')}</h1>
          <p className="text-xs text-gray-500">
            {client.type === 'company' ? client.company_name : client.name} • {client.type === 'company' ? t('clients.company') : t('clients.individual')}
          </p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-blue-900 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center">
              <User className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">
                  {client.type === 'company' ? client.company_name : client.name}
                </h2>
                <span className="px-2 py-0.5 bg-white/20 rounded text-[10px] font-medium">
                  {client.type === 'company' ? t('clients.company') : t('clients.individual')}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-300">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {client.email || t('clients.noEmail')}
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {client.phone || t('clients.noPhone')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              to={`/clients/${id}/edit`}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors flex items-center gap-1.5 text-sm"
            >
              <Edit2 className="w-4 h-4" />
              {t('clients.edit')}
            </Link>
            <button
              onClick={() => {
                if (confirm(t('clients.deleteConfirm'))) {
                  deleteMutation.mutate(id!)
                }
              }}
              className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 font-medium rounded-lg transition-colors flex items-center gap-1.5 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              {t('clients.delete')}
            </button>
          </div>
        </div>
      </div>

      <UnderlineTabs
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'overview', label: t('clients.tabOverview') },
          { id: 'vehicles', label: t('clients.tabVehicles') },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {activeTab === 'overview' && (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-gray-900">{t('clients.contactInformation')}</h3>
                  <Link to={`/clients/${id}/edit`} className="text-brand-primary hover:text-brand-primary-dark text-xs font-medium flex items-center gap-1">
                    <Edit2 className="w-3.5 h-3.5" />
                    {t('clients.edit')}
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-brand-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{t('clients.primaryContact')}</p>
                      <p className="font-medium text-gray-900 text-sm">{client.name}</p>
                    </div>
                  </div>
                  {client.company_name && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                        <Building className="w-4 h-4 text-gray-600" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{t('clients.companyName')}</p>
                        <p className="font-medium text-gray-900 text-sm">{client.company_name}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <Mail className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{t('clients.email')}</p>
                      {client.email ? (
                        <a href={`mailto:${client.email}`} className="font-medium text-brand-primary hover:underline text-sm">
                          {client.email}
                        </a>
                      ) : (
                        <p className="font-medium text-gray-900 text-sm">{t('clients.notAvailable')}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                      <Phone className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{t('clients.phone')}</p>
                      {client.phone ? (
                        <a href={`tel:${client.phone}`} className="font-medium text-brand-primary hover:underline text-sm">
                          {client.phone}
                        </a>
                      ) : (
                        <p className="font-medium text-gray-900 text-sm">{t('clients.notAvailable')}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">{t('clients.quickStats')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">{t('clients.vehicles')}</p>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">{vehicles.length}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">{t('clients.preferredChannelStat')}</p>
                    <p className="font-medium text-gray-900 mt-0.5 text-sm">{client.preferred_channel || t('clients.notAvailable')}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">{t('clients.clientSince')}</p>
                    <p className="font-medium text-gray-900 mt-0.5 text-sm">
                      {new Date(client.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'vehicles' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-gray-900">{t('clients.vehiclesCount', { count: vehicles.length })}</h3>
                <Link to="/vehicles/new" className="text-brand-primary hover:text-brand-primary-dark text-xs font-medium flex items-center gap-1">
                  <Car className="w-3.5 h-3.5" />
                  {t('clients.addVehicle')}
                </Link>
              </div>
              <div className="space-y-2">
                {vehicles.length > 0 ? (
                  vehicles.map((vehicle: any) => (
                    <Link
                      key={vehicle.id}
                      to={`/vehicles/${vehicle.id}`}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                          <Car className="w-4 h-4 text-gray-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">
                            {vehicle.make} {vehicle.model}
                          </p>
                          <p className="text-xs text-gray-500">
                            {vehicle.license_plate} • {vehicle.year}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" />
                    </Link>
                  ))
                ) : (
                  <div className="text-center py-6 text-gray-500 text-sm">
                    <Car className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p>{t('clients.noVehicles')}</p>
                    <Link to="/vehicles/new" className="text-brand-primary hover:underline text-xs font-medium mt-1.5 inline-block">
                      {t('clients.addVehicleCta')}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-base font-semibold text-gray-900 mb-3">{t('clients.quickActions')}</h3>
            <div className="space-y-2">
              <Link
                to={`/vehicles/new?ownerId=${id}`}
                className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 text-sm"
              >
                <Car className="w-3.5 h-3.5" />
                {t('clients.addVehicle')}
              </Link>
              <Link
                to="/visits"
                className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 text-sm"
              >
                <Calendar className="w-3.5 h-3.5" />
                {t('clients.newVisit')}
              </Link>
              <Link
                to={`/clients/${id}/edit`}
                className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 text-sm"
              >
                <Edit2 className="w-3.5 h-3.5" />
                {t('clients.editClient')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
