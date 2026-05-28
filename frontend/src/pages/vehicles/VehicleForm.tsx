import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { vehiclesApi, clientsApi, authApi } from '@/api'
import { ArrowLeft, Loader2, QrCode, X, Printer } from 'lucide-react'
import { useState, useEffect } from 'react'
import PhotoUpload from '@/components/PhotoUpload'
import { printQrCode } from '@/lib/printQr'
import { useApiToast } from '@/hooks/useApiToast'
import { resolveMediaUrl } from '@/lib/utils'
import { useSelector } from 'react-redux'
import { canManageWorkshopData, normalizeRole } from '@/lib/roles'
import {
  kmToOdometerDisplay,
  odometerDisplayToKm,
  type OdometerUnit,
} from '@/lib/odometer'
import type { RootState } from '@/store'
import { useTranslation } from 'react-i18next'

const vehicleSchema = z.object({
  owner_id: z
    .string()
    .optional()
    .refine((value) => !value || z.string().uuid().safeParse(value).success, {
      message: 'Invalid owner selected',
    }),
  vin: z.string().min(1, 'VIN is required'),
  license_plate: z.string().min(1, 'License plate is required'),
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  year: z.coerce.number().min(1900).max(new Date().getFullYear() + 1),
  engine_type: z.string().optional(),
  fuel_type: z.string().optional(),
  description: z.string().optional(),
  odometer_reading: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
  odometer_unit: z.enum(['km', 'mi']),
  hour_meter: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
  assigned_mechanic_id: z.string().optional(),
})

type VehicleFormValues = z.infer<typeof vehicleSchema>

function appendOptionalReading(
  formData: FormData,
  key: 'odometer_km' | 'hour_meter',
  value: number | null,
  isEdit: boolean,
) {
  if (value != null) {
    formData.append(key, String(value))
  } else if (isEdit) {
    formData.append(key, '')
  }
}

function buildVehicleFormData(
  data: VehicleFormValues,
  options: { isEdit: boolean; canAssignMechanic: boolean; photoFile: File | null },
) {
  const formData = new FormData()
  if (options.isEdit) {
    formData.append('owner_id', data.owner_id || '')
  } else if (data.owner_id) {
    formData.append('owner_id', data.owner_id)
  }
  formData.append('vin', data.vin)
  formData.append('license_plate', data.license_plate)
  formData.append('make', data.make)
  formData.append('model', data.model)
  formData.append('year', String(data.year))
  if (data.engine_type) formData.append('engine_type', data.engine_type)
  if (data.fuel_type) formData.append('fuel_type', data.fuel_type)
  formData.append('description', data.description || '')
  formData.append('odometer_unit', data.odometer_unit)
  appendOptionalReading(
    formData,
    'odometer_km',
    odometerDisplayToKm(data.odometer_reading, data.odometer_unit),
    options.isEdit,
  )
  appendOptionalReading(
    formData,
    'hour_meter',
    data.hour_meter === '' || data.hour_meter == null ? null : Number(data.hour_meter),
    options.isEdit,
  )
  if (options.canAssignMechanic) {
    formData.append('assigned_mechanic_id', data.assigned_mechanic_id || '')
  }
  if (options.photoFile) formData.append('photo', options.photoFile)
  if (!options.isEdit) formData.append('is_active', 'true')
  return formData
}

export default function VehicleForm() {
  const { t } = useTranslation()
  const { showError } = useApiToast()
  const { user } = useSelector((state: RootState) => state.auth)
  const canAssignMechanic = canManageWorkshopData(normalizeRole(user?.role))
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!id
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | undefined>()
  const [showQRModal, setShowQRModal] = useState(false)
  const [qrCodeData, setQRCodeData] = useState<string | null>(null)
  const [createdVehicleId, setCreatedVehicleId] = useState<string | null>(null)

  const { data: vehicleData, isLoading: isFetching } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => vehiclesApi.get(id!),
    enabled: isEdit,
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list(),
  })

  const { data: mechanicsData } = useQuery({
    queryKey: ['tenant-mechanics'],
    queryFn: () => authApi.listMechanics(),
    enabled: canAssignMechanic,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      owner_id: '',
      vin: '',
      license_plate: '',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      engine_type: '',
      fuel_type: '',
      description: '',
      odometer_reading: '',
      odometer_unit: 'km' as OdometerUnit,
      hour_meter: '',
      assigned_mechanic_id: '',
    },
  })

  useEffect(() => {
    if (isEdit && vehicleData?.data) {
      const unit = (vehicleData.data.odometer_unit === 'mi' ? 'mi' : 'km') as OdometerUnit
      reset({
        owner_id: vehicleData.data.owner?.id || vehicleData.data.owner_id || '',
        vin: vehicleData.data.vin,
        license_plate: vehicleData.data.license_plate,
        make: vehicleData.data.make,
        model: vehicleData.data.model,
        year: vehicleData.data.year,
        engine_type: vehicleData.data.engine_type || '',
        fuel_type: vehicleData.data.fuel_type || '',
        description: vehicleData.data.description || '',
        odometer_reading:
          vehicleData.data.odometer_km != null
            ? kmToOdometerDisplay(vehicleData.data.odometer_km, unit) ?? ''
            : '',
        odometer_unit: unit,
        hour_meter: vehicleData.data.hour_meter ?? '',
        assigned_mechanic_id: vehicleData.data.assigned_mechanic?.id || '',
      })
      if (vehicleData.data.photo) {
        setPhotoPreview(resolveMediaUrl(vehicleData.data.photo))
      }
    }
  }, [isEdit, vehicleData, reset])

  const handlePhotoUpload = (file: File | null, preview: string) => {
    setPhotoFile(file)
    setPhotoPreview(preview || undefined)
  }

  const createMutation = useMutation({
    mutationFn: async (data: VehicleFormValues) =>
      vehiclesApi.create(buildVehicleFormData(data, { isEdit: false, canAssignMechanic, photoFile })),
    onSuccess: async (response) => {
      const vehicleId = response.data.id
      setCreatedVehicleId(vehicleId)
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })

      // Fetch QR code
      try {
        const qrResponse = await vehiclesApi.ownerClaimQr(vehicleId)
        setQRCodeData(qrResponse.data.qr_code)
        setShowQRModal(true)
      } catch (qrError) {
        console.error('Failed to fetch QR code:', qrError)
        // Still navigate even if QR code fails
        navigate('/vehicles')
      }
    },
    onError: (error: unknown) => showError(error, 'Failed to create vehicle'),
  })

  const updateMutation = useMutation({
    mutationFn: async (data: VehicleFormValues) =>
      vehiclesApi.patch(
        id!,
        buildVehicleFormData(data, { isEdit: true, canAssignMechanic, photoFile }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles', 'vehicle'] })
      navigate('/vehicles')
    },
    onError: (error: unknown) => showError(error, 'Failed to update vehicle'),
  })

  const onSubmit = (data: VehicleFormValues) => {
    if (isEdit) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  if (isFetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  const clients = clientsData?.data?.results || clientsData?.data || []
  const mechanics = mechanicsData?.data || []

  const mechanicLabel = (mechanic: {
    first_name?: string
    last_name?: string
    username: string
  }) => {
    const full = [mechanic.first_name, mechanic.last_name].filter(Boolean).join(' ')
    return full || mechanic.username
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/vehicles" className="p-2 text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? 'Edit Vehicle' : 'New Vehicle'}
          </h1>
          <p className="text-gray-500 mt-1">
            {isEdit ? 'Update vehicle information' : 'Register a vehicle at this workshop (saved to the global registry)'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Owner */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
            <select {...register('owner_id')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
              <option value="">No owner yet — assign later after paperwork check</option>
              {clients.map((client: any) => (
                <option key={client.id} value={client.id}>
                  {client.type === 'company' ? client.company_name : client.name}
                </option>
              ))}
            </select>
            {errors.owner_id && <p className="text-sm text-red-600 mt-1">{errors.owner_id.message}</p>}
          </div>

          {/* VIN */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">VIN *</label>
            <input {...register('vin')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="1HGCM82633A123456" />
            {errors.vin && <p className="text-sm text-red-600 mt-1">{errors.vin.message}</p>}
          </div>

          {/* License Plate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">License Plate *</label>
            <input {...register('license_plate')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="ABC-1234" />
            {errors.license_plate && <p className="text-sm text-red-600 mt-1">{errors.license_plate.message}</p>}
          </div>

          {/* Make */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Make *</label>
            <input {...register('make')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Toyota" />
            {errors.make && <p className="text-sm text-red-600 mt-1">{errors.make.message}</p>}
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model *</label>
            <input {...register('model')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Camry" />
            {errors.model && <p className="text-sm text-red-600 mt-1">{errors.model.message}</p>}
          </div>

          {/* Year */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Year *</label>
            <input {...register('year')} type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            {errors.year && <p className="text-sm text-red-600 mt-1">{errors.year.message}</p>}
          </div>

          {/* Engine Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Engine Type</label>
            <input {...register('engine_type')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="2.5L I4" />
          </div>

          {/* Fuel Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type</label>
            <select {...register('fuel_type')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
              <option value="">Select...</option>
              <option value="Gasoline">Gasoline</option>
              <option value="Diesel">Diesel</option>
              <option value="Electric">Electric</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <p className="text-sm font-medium text-gray-700 mb-2">{t('vehicles.mileageHoursOptional')}</p>
            <p className="text-xs text-gray-500 mb-3">{t('vehicles.mileageHoursHint')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.odometer')}</label>
                <div className="flex gap-2">
                  <input
                    {...register('odometer_reading')}
                    type="number"
                    min={0}
                    step={1}
                    placeholder="—"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <select
                    {...register('odometer_unit')}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="km">{t('vehicles.unitKm')}</option>
                    <option value="mi">{t('vehicles.unitMi')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.hourMeter')}</label>
                <input
                  {...register('hour_meter')}
                  type="number"
                  min={0}
                  step={1}
                  placeholder="—"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {canAssignMechanic && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('vehicles.assignedMechanic')}
              </label>
              <select
                {...register('assigned_mechanic_id')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">{t('vehicles.unassignedMechanic')}</option>
                {mechanics.map((mechanic: { id: string; username: string; first_name?: string; last_name?: string }) => (
                  <option key={mechanic.id} value={mechanic.id}>
                    {mechanicLabel(mechanic)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicles.description')}</label>
            <textarea
              {...register('description')}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y min-h-[6rem]"
              placeholder={t('vehicles.descriptionPlaceholder')}
            />
          </div>
        </div>

        {/* Photo Upload */}
        <div>
          <PhotoUpload
            onUpload={handlePhotoUpload}
            currentFile={photoFile}
            currentPreview={photoPreview}
            label="Vehicle Photo"
            objectFit="contain"
            previewHeightClass="h-72"
            enableCameraCapture
          />
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-100">
          <Link to="/vehicles" className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">Cancel</Link>
          <button type="submit" disabled={isSubmitting || createMutation.isPending || updateMutation.isPending} className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {(isSubmitting || createMutation.isPending || updateMutation.isPending) ? (
              <><Loader2 className="w-4 h-4 mr-2 inline animate-spin" />Saving...</>
            ) : (
              isEdit ? 'Update Vehicle' : 'Create Vehicle'
            )}
          </button>
        </div>
      </form>

      {/* QR Code Modal */}
      {showQRModal && qrCodeData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Owner claim QR</h3>
                  <p className="text-xs text-gray-500">Give this to the vehicle owner to add it to their app</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowQRModal(false)
                  navigate('/vehicles')
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* QR Code */}
            <div className="p-6 flex flex-col items-center">
              <div className="bg-white p-4 rounded-xl border-2 border-gray-200 shadow-sm">
                <img
                  src={qrCodeData}
                  alt="Vehicle QR Code"
                  className="w-48 h-48"
                />
              </div>
              <p className="text-sm text-gray-600 mt-4 text-center">
                Owner scans this QR to add the vehicle to their personal inventory
              </p>
              <p className="text-xs text-gray-400 mt-1 font-mono">
                ID: {createdVehicleId}
              </p>
            </div>

            {/* Actions */}
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => {
                  setShowQRModal(false)
                  navigate('/vehicles')
                }}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Done
              </button>
              <button
                onClick={() => {
                  printQrCode({
                    qrCodeData,
                    lines: [`Vehicle ID: ${createdVehicleId}`, 'Scan to look up vehicle'],
                  })
                }}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
