import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { visitsApi, vehiclesApi, inspectionsApi, api } from '@/api'
import { useToast } from '@/components/ui/Toast'
import { getApiErrorMessage } from '@/lib/utils'
import { hasInspectionContent, pickInspectionForVisit } from '@/lib/inspection'
import { isAlreadyClosedVisitError, isVisitClosed, isVisitOpen, visitQueryOptions } from '@/lib/visits'
import ServiceLineForm from './ServiceLineForm'
import LaborLineForm from './LaborLineForm'
import MaterialLineForm from './MaterialLineForm'
import { PageTabs, SegmentTabs } from '@/components/ui/PageTabs'
import VisitStatusBadge from '@/components/ui/VisitStatusBadge'
import { WorkLineList, type WorkLineRow } from '@/components/visits/WorkLineList'
import { formatEuro, MULTIPLY } from '@/lib/money'
import {
  ArrowLeft,
  Car,
  Gauge,
  Wrench,
  CheckCircle,
  ClipboardList,
  Plus,
  Loader2,
} from 'lucide-react'

export default function VisitForm() {
  const { id: visitId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const vehicleIdFromUrl = searchParams.get('vehicleId')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const creatingForVehicleRef = useRef<string | null>(null)
  const hydratedVisitIdRef = useRef<string | null>(null)

  const isNewRoute = !visitId

  const [mileage, setMileage] = useState(0)
  const [hourMeter, setHourMeter] = useState(0)
  const [notes, setNotes] = useState('')
  const [pickVehicleId, setPickVehicleId] = useState(vehicleIdFromUrl || '')
  const [showServiceForm, setShowServiceForm] = useState(false)
  const [showLaborForm, setShowLaborForm] = useState(false)
  const [showMaterialForm, setShowMaterialForm] = useState(false)

  const {
    data: visitData,
    isLoading: visitLoading,
    isFetching: visitFetching,
  } = useQuery({
    queryKey: ['visit', visitId],
    queryFn: () => visitsApi.get(visitId!),
    ...visitQueryOptions(visitId),
  })

  const visit = visitData?.data
  const activeVehicleId = vehicleIdFromUrl || visit?.vehicle?.id || visit?.vehicle_id

  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.list(),
    enabled: isNewRoute && !vehicleIdFromUrl,
  })

  const { data: vehicleData } = useQuery({
    queryKey: ['vehicle', activeVehicleId],
    queryFn: () => vehiclesApi.get(activeVehicleId!),
    enabled: !!activeVehicleId,
  })

  const selectedVehicle = vehicleData?.data
  const vehicles = vehiclesData?.data?.results || vehiclesData?.data || []

  const { data: serviceLinesData } = useQuery({
    queryKey: ['service-lines', { visit: visitId }],
    queryFn: () => visitsApi.serviceLines.list({ visit: visitId }),
    enabled: !!visitId,
  })

  const { data: materialLinesData } = useQuery({
    queryKey: ['material-lines', { visit: visitId }],
    queryFn: () => visitsApi.materialLines.list({ visit: visitId }),
    enabled: !!visitId,
  })

  const { data: laborLinesData } = useQuery({
    queryKey: ['labor-lines', { visit: visitId }],
    queryFn: () => visitsApi.laborLines.list({ visit: visitId }),
    enabled: !!visitId,
  })

  const { data: inspectionData } = useQuery({
    queryKey: ['inspection', { visit: visitId }],
    queryFn: () => inspectionsApi.list({ visit: visitId }),
    enabled: !!visitId,
  })

  const visitInspection = pickInspectionForVisit(
    inspectionData?.data?.results || inspectionData?.data,
    visitId || '',
  )
  const inspectionComplete = hasInspectionContent(visitInspection)

  const serviceLines = serviceLinesData?.data?.results || serviceLinesData?.data || []
  const materialLines = materialLinesData?.data?.results || materialLinesData?.data || []
  const laborLines = laborLinesData?.data?.results || laborLinesData?.data || []

  const grandTotal = [...serviceLines, ...materialLines, ...laborLines].reduce(
    (sum: number, line: { total_price?: string | number }) =>
      sum + (parseFloat(String(line.total_price)) || 0),
    0,
  )

  useEffect(() => {
    if (isNewRoute && vehicleIdFromUrl) {
      queryClient.removeQueries({ queryKey: ['visit'] })
    }
  }, [isNewRoute, vehicleIdFromUrl, queryClient])

  useEffect(() => {
    if (!isNewRoute) {
      creatingForVehicleRef.current = null
    }
  }, [isNewRoute])

  useEffect(() => {
    if (!visit) return
    if (hydratedVisitIdRef.current !== visit.id) {
      hydratedVisitIdRef.current = visit.id
      setMileage(visit.mileage_km || 0)
      setHourMeter(visit.hour_meter || 0)
      setNotes(visit.notes || '')
    }
    if (isVisitClosed(visit.status)) {
      navigate(`/visits/${visit.id}`, { replace: true })
    }
  }, [visit, navigate])

  const createVisitMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      const vehicleRes = await vehiclesApi.get(vehicleId)
      const odometer = vehicleRes.data?.odometer_km || 0
      return visitsApi.create({
        vehicle_id: vehicleId,
        mileage_km: odometer,
        notes: '',
        service_date: new Date().toISOString(),
        status: 'draft',
      })
    },
    onSuccess: (response) => {
      hydratedVisitIdRef.current = null
      queryClient.invalidateQueries({ queryKey: ['visits'] })
      if (vehicleIdFromUrl) {
        queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleIdFromUrl] })
      }
      navigate(`/visits/${response.data.id}/edit`, { replace: true })
    },
    onError: (error: unknown) => {
      creatingForVehicleRef.current = null
      showToast(getApiErrorMessage(error, 'Failed to create visit'), 'error')
    },
  })

  useEffect(() => {
    if (
      isNewRoute &&
      vehicleIdFromUrl &&
      selectedVehicle &&
      creatingForVehicleRef.current !== vehicleIdFromUrl &&
      !createVisitMutation.isPending
    ) {
      creatingForVehicleRef.current = vehicleIdFromUrl
      createVisitMutation.mutate(vehicleIdFromUrl)
    }
  }, [isNewRoute, vehicleIdFromUrl, selectedVehicle, createVisitMutation.isPending])

  const saveMutation = useMutation({
    mutationFn: () =>
      visitsApi.patch(visitId!, {
        mileage_km: mileage,
        hour_meter: hourMeter,
        notes: notes || '',
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(['visit', visitId], response)
      queryClient.invalidateQueries({ queryKey: ['visits'] })
      if (activeVehicleId) {
        queryClient.invalidateQueries({ queryKey: ['vehicle', activeVehicleId] })
      }
      showToast('Visit saved', 'success')
    },
    onError: (error: unknown) =>
      showToast(getApiErrorMessage(error, 'Failed to save visit'), 'error'),
  })

  const finishMutation = useMutation({
    mutationFn: async () => {
      const fresh = await visitsApi.get(visitId!)
      const status = fresh.data?.status as string | undefined
      if (isVisitClosed(status)) {
        const err = new Error('Visit already closed') as Error & { code?: string }
        err.code = 'ALREADY_CLOSED'
        throw err
      }
      return visitsApi.finishVisit(visitId!, {
        mileage_km: mileage,
        hour_meter: hourMeter,
        notes: notes || '',
      })
    },
    onSuccess: (response) => {
      queryClient.setQueryData(['visit', visitId], response)
      queryClient.invalidateQueries({ queryKey: ['visits'] })
      if (activeVehicleId) {
        queryClient.invalidateQueries({ queryKey: ['vehicle', activeVehicleId] })
        queryClient.invalidateQueries({ queryKey: ['visits', { vehicle: activeVehicleId }] })
      }
      const alreadyDone = response.data?.already_completed
      showToast(
        alreadyDone ? 'This visit was already completed.' : 'Visit completed',
        alreadyDone ? 'info' : 'success',
      )
      navigate(`/visits/${visitId}`, { replace: true })
    },
    onError: (error: unknown) => {
      if (
        (error as { code?: string })?.code === 'ALREADY_CLOSED' ||
        isAlreadyClosedVisitError(error)
      ) {
        queryClient.invalidateQueries({ queryKey: ['visit', visitId] })
        showToast('This visit is already completed. Opening the visit summary.', 'info')
        navigate(`/visits/${visitId}`, { replace: true })
        return
      }
      showToast(getApiErrorMessage(error, 'Failed to finish visit'), 'error')
    },
  })

  const deleteServiceMutation = useMutation({
    mutationFn: (lineId: string) => api.delete(`/visits/service-lines/${lineId}/`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['service-lines', { visit: visitId }] }),
  })

  const deleteMaterialMutation = useMutation({
    mutationFn: (lineId: string) => api.delete(`/visits/material-lines/${lineId}/`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['material-lines', { visit: visitId }] }),
  })

  const deleteLaborMutation = useMutation({
    mutationFn: (lineId: string) => api.delete(`/visits/labor-lines/${lineId}/`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['labor-lines', { visit: visitId }] }),
  })

  if (isNewRoute && !vehicleIdFromUrl) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <Link to="/visits" className="inline-flex items-center gap-2 text-workshop-charcoal/60 hover:text-workshop-charcoal">
          <ArrowLeft className="w-4 h-4" />
          Back to visits
        </Link>
        <VehiclePickerCard
          vehicles={vehicles}
          pickVehicleId={pickVehicleId}
          setPickVehicleId={setPickVehicleId}
          onContinue={() => pickVehicleId && setSearchParams({ vehicleId: pickVehicleId })}
        />
      </div>
    )
  }

  if (isNewRoute && (createVisitMutation.isPending || !visitId)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
        <p className="text-workshop-charcoal/60 mt-3">Starting visit...</p>
      </div>
    )
  }

  if (visitLoading || visitFetching || !visit) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
        <p className="text-workshop-charcoal/60 mt-3">Loading visit...</p>
      </div>
    )
  }

  const isEditable = isVisitOpen(visit.status)

  return (
    <VisitEditor
      visitId={visitId!}
      visit={visit}
      selectedVehicle={selectedVehicle}
      mileage={mileage}
      setMileage={setMileage}
      hourMeter={hourMeter}
      setHourMeter={setHourMeter}
      notes={notes}
      setNotes={setNotes}
      inspectionComplete={inspectionComplete}
      isEditable={isEditable}
      serviceLines={serviceLines}
      materialLines={materialLines}
      laborLines={laborLines}
      grandTotal={grandTotal}
      showServiceForm={showServiceForm}
      setShowServiceForm={setShowServiceForm}
      showLaborForm={showLaborForm}
      setShowLaborForm={setShowLaborForm}
      showMaterialForm={showMaterialForm}
      setShowMaterialForm={setShowMaterialForm}
      deleteServiceMutation={deleteServiceMutation}
      deleteMaterialMutation={deleteMaterialMutation}
      deleteLaborMutation={deleteLaborMutation}
      saveMutation={saveMutation}
      finishMutation={finishMutation}
    />
  )
}

function VehiclePickerCard({
  vehicles,
  pickVehicleId,
  setPickVehicleId,
  onContinue,
}: {
  vehicles: { id: string; license_plate: string; make: string; model: string }[]
  pickVehicleId: string
  setPickVehicleId: (id: string) => void
  onContinue: () => void
}) {
  return (
    <div className="card p-6 space-y-4">
      <h1 className="text-xl font-bold text-workshop-charcoal">New service visit</h1>
      <p className="text-sm text-workshop-charcoal/60">Select the vehicle for this visit.</p>
      <select
        value={pickVehicleId}
        onChange={(e) => setPickVehicleId(e.target.value)}
        className="input w-full"
      >
        <option value="">Choose a vehicle...</option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.license_plate} — {v.make} {v.model}
          </option>
        ))}
      </select>
      <button type="button" onClick={onContinue} disabled={!pickVehicleId} className="btn btn-primary w-full">
        Continue
      </button>
    </div>
  )
}

function VisitEditor({
  visitId,
  visit,
  selectedVehicle,
  mileage,
  setMileage,
  hourMeter,
  setHourMeter,
  notes,
  setNotes,
  inspectionComplete,
  isEditable,
  serviceLines,
  materialLines,
  laborLines,
  grandTotal,
  showServiceForm,
  setShowServiceForm,
  showLaborForm,
  setShowLaborForm,
  showMaterialForm,
  setShowMaterialForm,
  deleteServiceMutation,
  deleteMaterialMutation,
  deleteLaborMutation,
  saveMutation,
  finishMutation,
}: {
  visitId: string
  visit: { status: string }
  selectedVehicle?: { make: string; model: string; license_plate: string; owner?: { name: string } }
  mileage: number
  setMileage: (n: number) => void
  hourMeter: number
  setHourMeter: (n: number) => void
  notes: string
  setNotes: (s: string) => void
  inspectionComplete: boolean
  isEditable: boolean
  serviceLines: { id: string; description: string; quantity: number; total_price: string | number }[]
  materialLines: {
    id: string
    inventory_item_detail?: { name: string }
    quantity: number
    total_price: string | number
  }[]
  laborLines: { id: string; description: string; hours: number; total_price: string | number }[]
  grandTotal: number
  showServiceForm: boolean
  setShowServiceForm: (v: boolean) => void
  showLaborForm: boolean
  setShowLaborForm: (v: boolean) => void
  showMaterialForm: boolean
  setShowMaterialForm: (v: boolean) => void
  deleteServiceMutation: { mutate: (id: string) => void }
  deleteMaterialMutation: { mutate: (id: string) => void }
  deleteLaborMutation: { mutate: (id: string) => void }
  saveMutation: { mutate: () => void; isPending: boolean }
  finishMutation: { mutate: () => void; isPending: boolean }
}) {
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<'details' | 'work' | 'inspection'>('work')
  const [workSegment, setWorkSegment] = useState<'services' | 'parts' | 'labor'>('services')

  const serviceRows: WorkLineRow[] = serviceLines.map((l) => ({
    id: l.id,
    label: l.description,
    sub: `${l.quantity} ${MULTIPLY} ${formatEuro((l as { unit_price?: string | number }).unit_price)}`,
    total: l.total_price,
  }))

  const materialRows: WorkLineRow[] = materialLines.map((l) => ({
    id: l.id,
    label: l.inventory_item_detail?.name || 'Part',
    sub: `${l.quantity} ${MULTIPLY} ${formatEuro((l as { unit_price?: string | number }).unit_price)}`,
    total: l.total_price,
  }))

  const laborRows: WorkLineRow[] = laborLines.map((l) => ({
    id: l.id,
    label: l.description,
    sub: `${l.hours}h ${MULTIPLY} ${formatEuro((l as { hourly_rate?: string | number }).hourly_rate)}/hr`,
    total: l.total_price,
  }))

  const openAddForSegment = () => {
    if (workSegment === 'services') setShowServiceForm(true)
    else if (workSegment === 'parts') setShowMaterialForm(true)
    else setShowLaborForm(true)
  }

  const activeWorkRows =
    workSegment === 'services' ? serviceRows : workSegment === 'parts' ? materialRows : laborRows
  const activeWorkEmpty =
    workSegment === 'services'
      ? 'No services added yet'
      : workSegment === 'parts'
        ? 'No parts added yet'
        : 'No labor added yet'
  const activeWorkDelete =
    workSegment === 'services'
      ? (lineId: string) => deleteServiceMutation.mutate(lineId)
      : workSegment === 'parts'
        ? (lineId: string) => deleteMaterialMutation.mutate(lineId)
        : (lineId: string) => deleteLaborMutation.mutate(lineId)

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-28">
      <VisitFormHeader visitId={visitId} visit={visit} />

      {selectedVehicle && (
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Car className="w-5 h-5 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 truncate">
              {selectedVehicle.make} {selectedVehicle.model}
            </p>
            <p className="text-sm text-secondary truncate">
              {selectedVehicle.license_plate}
              {selectedVehicle.owner?.name ? ` \u00b7 ${selectedVehicle.owner.name}` : ''}
            </p>
          </div>
          <span className="text-xl font-bold text-accent tabular-nums shrink-0">
            {formatEuro(grandTotal)}
          </span>
        </div>
      )}

      <PageTabs
        active={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        tabs={[
          { id: 'details', label: 'Details', icon: Gauge },
          {
            id: 'work',
            label: 'Work',
            icon: Wrench,
            badge: serviceLines.length + materialLines.length + laborLines.length || undefined,
          },
          { id: 'inspection', label: 'Inspection', icon: ClipboardList },
        ]}
      />

      {activeTab === 'details' && (
      <div className="card p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Mileage (km)</label>
            <input
              type="number"
              min={0}
              value={mileage || ''}
              onChange={(e) => setMileage(parseInt(e.target.value, 10) || 0)}
              disabled={!isEditable}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Hour meter (hrs)</label>
            <input
              type="number"
              min={0}
              value={hourMeter || ''}
              onChange={(e) => setHourMeter(parseInt(e.target.value, 10) || 0)}
              disabled={!isEditable}
              className="input w-full"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!isEditable}
            rows={3}
            className="input w-full"
            placeholder="Customer requests, findings..."
          />
        </div>
      </div>
      )}

      {activeTab === 'work' && (
      <div className="card p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <SegmentTabs
            active={workSegment}
            onChange={(id) => setWorkSegment(id as typeof workSegment)}
            tabs={[
              { id: 'services', label: 'Services', badge: serviceLines.length || undefined },
              { id: 'parts', label: 'Parts', badge: materialLines.length || undefined },
              { id: 'labor', label: 'Labor', badge: laborLines.length || undefined },
            ]}
          />
          {isEditable && (
            <button type="button" onClick={openAddForSegment} className="btn btn-primary shrink-0">
              <Plus className="w-4 h-4 mr-1" />
              Add {workSegment === 'services' ? 'service' : workSegment === 'parts' ? 'part' : 'labor'}
            </button>
          )}
        </div>
        <WorkLineList
          empty={activeWorkEmpty}
          lines={activeWorkRows}
          isEditable={isEditable}
          onDelete={activeWorkDelete}
        />
      </div>
      )}

      {activeTab === 'inspection' && (
      <div className="card p-6 space-y-3">
        {!inspectionComplete && isEditable && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            A 360° inspection is required before you can finish this visit.
          </div>
        )}
        {isEditable ? (
          <Link
            to={`/visits/${visitId}/inspection/new`}
            className="flex items-center justify-between gap-4 group"
          >
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                inspectionComplete ? 'bg-green-100' : 'bg-accent/10'
              }`}>
                <ClipboardList className={`w-5 h-5 ${inspectionComplete ? 'text-green-700' : 'text-accent'}`} />
              </div>
              <div>
                <p className="font-semibold text-gray-900 group-hover:text-accent transition-colors">
                  360{'\u00b0'} inspection
                </p>
                <p className="text-sm text-secondary mt-0.5">
                  {inspectionComplete ? 'Checklist completed' : 'Required — open checklist'}
                </p>
              </div>
            </div>
            <Plus className="w-5 h-5 text-gray-400 group-hover:text-accent" />
          </Link>
        ) : (
          <p className="text-sm text-secondary">
            {inspectionComplete ? 'Inspection recorded for this visit.' : 'No inspection on file.'}
          </p>
        )}
      </div>
      )}

      {isEditable && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-3 md:pl-64">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="text-sm text-secondary sm:pl-1">
              Total <span className="font-bold text-gray-900 text-lg ml-1">{formatEuro(grandTotal)}</span>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="btn btn-outline flex-1 sm:flex-none"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!inspectionComplete) {
                    showToast('Complete the 360° inspection before finishing this visit.', 'info')
                    setActiveTab('inspection')
                    return
                  }
                  finishMutation.mutate()
                }}
                disabled={finishMutation.isPending || mileage <= 0}
                className="btn btn-primary flex-1 sm:flex-none"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {finishMutation.isPending ? 'Finishing…' : 'Finish'}
              </button>
            </div>
          </div>
        </div>
      )}


      <ServiceLineForm isOpen={showServiceForm} onClose={() => setShowServiceForm(false)} />
      <LaborLineForm isOpen={showLaborForm} onClose={() => setShowLaborForm(false)} />
      <MaterialLineForm
        isOpen={showMaterialForm}
        onClose={() => setShowMaterialForm(false)}
        visitId={visitId}
      />
    </div>
  )
}

function VisitFormHeader({ visitId, visit }: { visitId: string; visit: { status: string } }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Link to={`/visits/${visitId}`} className="p-2 hover:bg-gray-100 rounded-lg shrink-0">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">Service visit</h1>
          <p className="text-sm text-secondary">#{visitId.slice(0, 8)}</p>
        </div>
      </div>
      <VisitStatusBadge status={visit.status} />
    </div>
  )
}
