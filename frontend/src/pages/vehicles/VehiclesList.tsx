import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { vehiclesApi } from '@/api'
import QRScanner from '@/components/QRScanner'
import { Plus, Search, QrCode, Loader2, Car } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useApiToast } from '@/hooks/useApiToast'
import {
  type VehicleRow,
  type ViewMode,
  ViewModeToggle,
  VehiclesGridView,
  VehiclesListView,
  VehiclesTableView,
} from './VehiclesListViews'

type StatusFilter = 'all' | 'in_service' | 'due_soon' | 'completed_today'
type ActiveFilter = 'true' | 'false' | 'all'

const VIEW_STORAGE_KEY = 'vehicles_list_view'

function readStoredView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY)
    if (v === 'grid' || v === 'list' || v === 'table') return v
  } catch {
    /* ignore */
  }
  return 'grid'
}

export default function VehiclesList() {
  const { t } = useTranslation()
  const { showError, showToast } = useApiToast()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('true')
  const [showScanner, setShowScanner] = useState(false)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredView)
  const navigate = useNavigate()

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode)
    } catch {
      /* ignore */
    }
  }, [viewMode])

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles', search, activeFilter],
    queryFn: () => vehiclesApi.list({ search, active: activeFilter }),
  })

  const handleScanSuccess = async (decodedText: string) => {
    setShowScanner(false)
    setIsLookingUp(true)

    try {
      const response = await vehiclesApi.lookup(decodedText)

      if (response.data) {
        if (response.data.id) {
          navigate(`/vehicles/${response.data.id}`)
        } else if (Array.isArray(response.data) && response.data.length === 1) {
          navigate(`/vehicles/${response.data[0].id}`)
        } else if (Array.isArray(response.data) && response.data.length > 1) {
          setSearch(decodedText)
        } else {
          showToast('Vehicle not found. Please check the QR code or enter details manually.', 'info')
        }
      }
    } catch (error: unknown) {
      const err = error as { response?: { status?: number } }
      if (err.response?.status === 404) {
        showToast('Vehicle not found. Please check the QR code or enter details manually.', 'info')
      } else {
        showError(error, 'Failed to look up vehicle')
      }
    } finally {
      setIsLookingUp(false)
    }
  }

  const vehicles = data?.data?.results || data?.data || []

  const filteredVehicles: VehicleRow[] = vehicles.filter((vehicle: VehicleRow) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'in_service') {
      return vehicle.visits?.some((v) => v.status === 'in_progress')
    }
    if (statusFilter === 'due_soon') {
      return vehicle.service_due_soon === true
    }
    if (statusFilter === 'completed_today') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return vehicle.visits?.some((v) => {
        const completedDate = new Date(v.completed_at ?? '')
        return v.status === 'completed' && completedDate >= today
      })
    }
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vehicle Check-In</h1>
          <p className="text-sm text-secondary mt-0.5">Search and check-in vehicles</p>
        </div>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
        <div className="bg-surface rounded-xl shadow-float p-4 border border-gray-100 flex flex-col justify-center h-full">
          <h2 className="text-base font-bold text-gray-900 mb-2">Find Vehicle</h2>
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Enter Plate, VIN, or Client Name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-24 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent focus:border-accent transition-colors outline-none text-gray-900 text-sm shadow-sm"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-accent text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors"
            >
              Search
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowScanner(true)}
          disabled={isLookingUp}
          className="bg-primary rounded-xl shadow-float p-4 border border-gray-800 flex flex-col items-center justify-center text-center relative overflow-hidden group cursor-pointer h-full min-h-[120px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-transparent opacity-50" />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white backdrop-blur-sm border border-white/20 group-hover:scale-110 transition-transform">
              {isLookingUp ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isLookingUp ? 'Looking Up...' : 'Scan QR Code'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isLookingUp ? 'Finding vehicle...' : 'Tap to open camera and scan vehicle sticker'}
              </p>
            </div>
          </div>
        </button>
      </section>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500">Filters:</span>
          {[
            { id: 'true' as ActiveFilter, label: t('vehicles.filterActive') },
            { id: 'false' as ActiveFilter, label: t('vehicles.filterArchived') },
            { id: 'all' as ActiveFilter, label: t('vehicles.filterAll') },
          ].map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeFilter === filter.id
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {filter.label}
            </button>
          ))}
          <span className="text-gray-300 mx-1">|</span>
          {[
            { id: 'all', label: 'All Vehicles' },
            { id: 'in_service', label: 'In Service' },
            { id: 'due_soon', label: 'Due Soon' },
            { id: 'completed_today', label: 'Completed Today' },
          ].map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatusFilter(filter.id as StatusFilter)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                statusFilter === filter.id
                  ? 'bg-blue-50 text-accent border border-blue-200'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
          <Link to="/vehicles/new" className="btn btn-primary text-sm py-2">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Vehicle
          </Link>
        </div>
      </div>

      <div>
        <h2 className="text-base font-bold text-gray-900 mb-3">
          Vehicles
          {!isLoading && filteredVehicles.length > 0 && (
            <span className="ml-2 text-sm font-normal text-secondary">({filteredVehicles.length})</span>
          )}
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredVehicles.length > 0 ? (
          <>
            {viewMode === 'grid' && <VehiclesGridView vehicles={filteredVehicles} />}
            {viewMode === 'list' && <VehiclesListView vehicles={filteredVehicles} />}
            {viewMode === 'table' && <VehiclesTableView vehicles={filteredVehicles} />}
          </>
        ) : (
          <div className="bg-surface rounded-xl shadow-float border border-gray-100 p-10 text-center">
            <Car className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-900 mb-1">No vehicles found</h3>
            <p className="text-secondary mb-4 text-sm">Get started by adding your first vehicle</p>
            <Link to="/vehicles/new" className="btn btn-primary text-sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Vehicle
            </Link>
          </div>
        )}
      </div>

      {showScanner && (
        <QRScanner
          onScanSuccess={handleScanSuccess}
          onScanError={(error) => {
            console.error('Scanner error:', error)
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}
