import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { inspectionsApi, visitsApi } from '@/api'
import { ArrowLeft, Loader2, CheckCircle, XCircle, AlertTriangle, Camera, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useApiToast } from '@/hooks/useApiToast'
import { hasInspectionContent, pickInspectionForVisit } from '@/lib/inspection'

interface InspectionSection {
  name: string
  items: { name: string; type: 'pass_fail' | 'slider' | 'severity' }[]
}

const inspectionSections: InspectionSection[] = [
  {
    name: 'Exterior',
    items: [
      { name: 'Lights', type: 'pass_fail' },
      { name: 'Scratches', type: 'pass_fail' },
      { name: 'Body Panels', type: 'pass_fail' },
    ],
  },
  {
    name: 'Tires',
    items: [
      { name: 'Front Left Wear', type: 'slider' },
      { name: 'Front Right Wear', type: 'slider' },
      { name: 'Rear Left Wear', type: 'slider' },
      { name: 'Rear Right Wear', type: 'slider' },
      { name: 'Air Pressure', type: 'pass_fail' },
    ],
  },
  {
    name: 'Brakes',
    items: [
      { name: 'Front Pad Wear', type: 'slider' },
      { name: 'Rear Pad Wear', type: 'slider' },
      { name: 'Disc Condition', type: 'severity' },
    ],
  },
  {
    name: 'Engine Bay',
    items: [
      { name: 'Oil Level', type: 'pass_fail' },
      { name: 'Coolant Level', type: 'pass_fail' },
      { name: 'Leaks', type: 'pass_fail' },
    ],
  },
  {
    name: 'Fluids',
    items: [
      { name: 'Brake Fluid', type: 'pass_fail' },
      { name: 'Steering Fluid', type: 'pass_fail' },
      { name: 'Washer Fluid', type: 'pass_fail' },
    ],
  },
  {
    name: 'Battery & Electrical',
    items: [
      { name: 'Battery Voltage', type: 'pass_fail' },
      { name: 'Charging System', type: 'pass_fail' },
    ],
  },
  {
    name: 'Suspension & Steering',
    items: [
      { name: 'Noise', type: 'severity' },
      { name: 'Looseness', type: 'severity' },
    ],
  },
  {
    name: 'Underbody',
    items: [
      { name: 'Exhaust', type: 'pass_fail' },
      { name: 'Rust', type: 'pass_fail' },
      { name: 'Oil Leaks', type: 'pass_fail' },
    ],
  },
]

export default function InspectionForm() {
  const { t } = useTranslation()
  const { showError, showToast } = useApiToast()
  const { id: inspectionId, visitId: visitIdParam } = useParams()
  const isEditMode = Boolean(inspectionId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState<Record<string, any>>({})
  const [sectionPhotos, setSectionPhotos] = useState<Record<string, string[]>>({})

  const { data: inspectionById, isLoading: inspectionByIdLoading } = useQuery({
    queryKey: ['inspection', inspectionId],
    queryFn: () => inspectionsApi.get(inspectionId!),
    enabled: isEditMode,
  })

  const resolvedVisitId =
    (isEditMode
      ? inspectionById?.data?.visit_id ?? inspectionById?.data?.visit
      : visitIdParam) ?? ''

  const { data: visitData, isLoading: visitLoading } = useQuery({
    queryKey: ['visit', resolvedVisitId],
    queryFn: () => visitsApi.get(String(resolvedVisitId)),
    enabled: Boolean(resolvedVisitId),
  })

  const { data: existingInspectionData, isLoading: inspectionLoading } = useQuery({
    queryKey: ['inspection', { visit: resolvedVisitId }],
    queryFn: () => inspectionsApi.list({ visit: resolvedVisitId }),
    enabled: Boolean(resolvedVisitId) && !isEditMode,
  })

  const existingForVisit = pickInspectionForVisit(
    existingInspectionData?.data?.results || existingInspectionData?.data || [],
    String(resolvedVisitId),
  )

  useEffect(() => {
    if (isEditMode && inspectionById?.data?.data) {
      setFormData(inspectionById.data.data as Record<string, unknown>)
    }
  }, [isEditMode, inspectionById])

  const invalidateAfterSave = () => {
    queryClient.invalidateQueries({ queryKey: ['visits'] })
    queryClient.invalidateQueries({ queryKey: ['inspection'] })
    queryClient.invalidateQueries({ queryKey: ['visit', resolvedVisitId] })
  }

  const createMutation = useMutation({
    mutationFn: (data: { visit_id: string; data: Record<string, any> }) =>
      inspectionsApi.create(data),
    onSuccess: () => {
      invalidateAfterSave()
      navigate(`/visits/${resolvedVisitId}`)
    },
    onError: (error: unknown) => {
      showError(error, t('inspections.saveFailed'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      inspectionsApi.update(inspectionId!, { data }),
    onSuccess: () => {
      invalidateAfterSave()
      navigate(`/inspections/${inspectionId}`)
    },
    onError: (error: unknown) => {
      showError(error, t('inspections.saveFailed'))
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resolvedVisitId) return
    if (!hasInspectionContent({ data: formData })) {
      showToast(t('inspections.needOneItem'), 'info')
      return
    }
    if (isEditMode) {
      updateMutation.mutate(formData)
      return
    }
    if (existingForVisit && hasInspectionContent(existingForVisit)) {
      showToast(t('inspections.alreadyExists'), 'info')
      navigate(`/inspections/${existingForVisit.id}`)
      return
    }
    createMutation.mutate({
      visit_id: String(resolvedVisitId),
      data: formData,
    })
  }

  const updateField = (section: string, item: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [item]: value,
      },
    }))
  }

  const handlePhotoUpload = async (section: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    const accepted: string[] = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        showToast(t('inspectionForm.imageOnly'), 'info')
        continue
      }
      if (file.size > 10 * 1024 * 1024) {
        showToast(t('inspectionForm.fileTooLarge', { name: file.name }), 'error')
        continue
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      accepted.push(dataUrl)
    }

    if (accepted.length === 0) return
    setSectionPhotos((prev) => ({
      ...prev,
      [section]: [...(prev[section] || []), ...accepted],
    }))
    // Reset the input so the same file can be selected again later.
    e.target.value = ''
  }

  const removePhoto = (section: string, index: number) => {
    setSectionPhotos((prev) => ({
      ...prev,
      [section]: (prev[section] || []).filter((_, i) => i !== index),
    }))
  }

  if (visitLoading || inspectionLoading || (isEditMode && inspectionByIdLoading)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
      </div>
    )
  }

  const visit = visitData?.data
  if (!visit) return null

  if (!isEditMode && hasInspectionContent(existingForVisit)) {
    return (
      <div className="max-w-lg mx-auto card p-6 space-y-4 text-center">
        <h1 className="text-xl font-bold text-workshop-charcoal">{t('inspections.alreadyRecordedTitle')}</h1>
        <p className="text-sm text-workshop-charcoal/60">{t('inspections.alreadyRecordedBody')}</p>
        <div className="flex flex-col gap-2">
          <Link to={`/inspections/${existingForVisit!.id}`} className="btn btn-primary">
            {t('inspections.viewInspection')}
          </Link>
          <Link to={`/visits/${resolvedVisitId}`} className="btn btn-outline">
            {t('inspections.backToVisit')}
          </Link>
        </div>
      </div>
    )
  }

  const cancelTo = isEditMode ? `/inspections/${inspectionId}` : `/visits/${resolvedVisitId}`

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to={cancelTo} className="p-2 text-workshop-charcoal/40 hover:text-workshop-charcoal transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">
            {isEditMode ? t('inspections.editTitle') : t('inspections.newTitle')}
          </h1>
          <p className="text-workshop-charcoal/60 mt-1">
            {visit.vehicle?.license_plate} - {visit.vehicle?.make} {visit.vehicle?.model}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {inspectionSections.map((section) => (
          <div key={section.name} className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-workshop-charcoal flex items-center gap-2">
                <span className="w-8 h-8 bg-workshop-blue/10 text-workshop-blue rounded-lg flex items-center justify-center text-sm">
                  {section.name[0]}
                </span>
                {t(`inspectionForm.sections.${section.name}`, { defaultValue: section.name })}
              </h2>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(e) => handlePhotoUpload(section.name, e)}
                  className="hidden"
                />
                <span className="btn btn-outline btn-sm flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  {t('inspections.addPhoto')}
                </span>
              </label>
            </div>

            {/* Photos */}
            {(sectionPhotos[section.name]?.length || 0) > 0 && (
              <div className="flex gap-2 mb-4 flex-wrap">
                {sectionPhotos[section.name]?.map((photo, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={photo}
                      alt={`${section.name} ${index + 1}`}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(section.name, index)}
                      className="absolute -top-2 -right-2 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.items.map((item) => (
                <div key={item.name} className="p-4 bg-workshop-charcoal/5 rounded-lg">
                  <label className="block text-sm font-medium text-workshop-charcoal mb-2">
                    {t(`inspectionForm.items.${item.name}`, { defaultValue: item.name })}
                  </label>

                  {item.type === 'pass_fail' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateField(section.name, item.name, 'pass')}
                        className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border transition-colors ${
                          formData[section.name]?.[item.name] === 'pass'
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-workshop-charcoal/10 hover:border-green-300'
                        }`}
                      >
                        <CheckCircle className="w-4 h-4" />
                        {t('inspectionForm.pass')}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField(section.name, item.name, 'fail')}
                        className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border transition-colors ${
                          formData[section.name]?.[item.name] === 'fail'
                            ? 'border-red-500 bg-red-50 text-red-700'
                            : 'border-workshop-charcoal/10 hover:border-red-300'
                        }`}
                      >
                        <XCircle className="w-4 h-4" />
                        {t('inspectionForm.fail')}
                      </button>
                    </div>
                  )}

                  {item.type === 'slider' && (
                    <div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={formData[section.name]?.[item.name] || 50}
                        onChange={(e) => updateField(section.name, item.name, parseInt(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-workshop-charcoal/40 mt-1">
                        <span>0%</span>
                        <span className="font-medium">{formData[section.name]?.[item.name] || 50}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  )}

                  {item.type === 'severity' && (
                    <div className="flex gap-2">
                      {['green', 'yellow', 'red'].map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => updateField(section.name, item.name, level)}
                          className={`flex-1 p-2 rounded-lg border transition-colors capitalize ${
                            formData[section.name]?.[item.name] === level
                              ? level === 'green' ? 'border-green-500 bg-green-50 text-green-700'
                                : level === 'yellow' ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                                : 'border-red-500 bg-red-50 text-red-700'
                              : 'border-workshop-charcoal/10'
                          }`}
                        >
                          <AlertTriangle className="w-4 h-4 mx-auto mb-1" />
                          {t(
                            level === 'green'
                              ? 'inspectionForm.severityGreen'
                              : level === 'yellow'
                                ? 'inspectionForm.severityYellow'
                                : 'inspectionForm.severityRed',
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-end gap-4">
          <Link to={cancelTo} className="btn btn-outline">{t('common.cancel')}</Link>
          <button type="submit" disabled={isSaving} className="btn btn-primary">
            {isSaving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('inspections.saving')}</>
            ) : isEditMode ? (
              t('inspections.saveChanges')
            ) : (
              t('inspections.completeInspection')
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
