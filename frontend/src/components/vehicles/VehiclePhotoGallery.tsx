import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Loader2, Pencil, Trash2, X } from 'lucide-react'
import { vehiclePhotosApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'

interface Photo {
  id: string
  image_url: string
  caption: string
  sort_order: number
  uploaded_by_username?: string
  created_at: string
}

interface Props {
  vehicleId: string
  canEdit: boolean
}

export function VehiclePhotoGallery({ vehicleId, canEdit }: Props) {
  const queryClient = useQueryClient()
  const { showError, showSuccess } = useApiToast()
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [lightbox, setLightbox] = useState<Photo | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftCaption, setDraftCaption] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['vehicle-photos', vehicleId],
    queryFn: () =>
      vehiclePhotosApi.list(vehicleId).then((r) => {
        const items = Array.isArray(r.data) ? r.data : r.data.results || []
        return items as Photo[]
      }),
    enabled: Boolean(vehicleId),
  })

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const list = Array.from(files)
      for (const file of list) {
        await vehiclePhotosApi.upload(vehicleId, file, '', (data?.length || 0))
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-photos', vehicleId] })
      showSuccess(t('photoGallery.uploadedToast'))
    },
    onError: (err) => showError(err, t('photoGallery.uploadError')),
  })

  const captionMutation = useMutation({
    mutationFn: ({ id, caption }: { id: string; caption: string }) =>
      vehiclePhotosApi.update(id, { caption }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-photos', vehicleId] })
      setEditingId(null)
    },
    onError: (err) => showError(err, t('photoGallery.captionError')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vehiclePhotosApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-photos', vehicleId] })
      setLightbox(null)
      showSuccess(t('photoGallery.deletedToast'))
    },
    onError: (err) => showError(err, t('photoGallery.deleteError')),
  })

  const photos = data || []

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-workshop-charcoal">{t('photoGallery.title')}</h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="btn btn-primary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImagePlus className="w-4 h-4" />
            )}
            {t('photoGallery.addPhotos')}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              uploadMutation.mutate(e.target.files)
              e.target.value = ''
            }
          }}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-workshop-blue" />
        </div>
      ) : photos.length === 0 ? (
        <p className="text-sm text-workshop-charcoal/60 py-6 text-center">
          {t('photoGallery.noPhotos')} {canEdit && t('photoGallery.addHint')}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative rounded-lg overflow-hidden border border-workshop-charcoal/10">
              <button
                type="button"
                className="w-full block"
                onClick={() => setLightbox(photo)}
              >
                <img
                  src={photo.image_url}
                  alt={photo.caption || t('photoGallery.title')}
                  className="w-full h-32 object-cover transition-transform group-hover:scale-105"
                />
              </button>
              {(photo.caption || canEdit) && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent text-white text-xs p-2 pt-6">
                  {editingId === photo.id ? (
                    <div className="flex gap-1">
                      <input
                        value={draftCaption}
                        onChange={(e) => setDraftCaption(e.target.value)}
                        className="flex-1 px-1.5 py-0.5 text-xs text-workshop-charcoal rounded"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          captionMutation.mutate({
                            id: photo.id,
                            caption: draftCaption,
                          })
                        }
                        className="px-2 bg-workshop-blue rounded text-xs"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{photo.caption || '—'}</span>
                      {canEdit && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(photo.id)
                              setDraftCaption(photo.caption)
                            }}
                            title={t('photoGallery.editCaption')}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(t('photoGallery.deleteConfirm'))) {
                                deleteMutation.mutate(photo.id)
                              }
                            }}
                            title={t('photoGallery.delete')}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white"
            onClick={() => setLightbox(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="max-w-5xl max-h-full">
            <img src={lightbox.image_url} alt={lightbox.caption} className="max-h-[80vh] w-auto rounded-lg" />
            <div className="text-white text-sm mt-3 flex items-center justify-between">
              <div>
                <p className="font-semibold">{lightbox.caption || '—'}</p>
                <p className="text-white/60 text-xs">
                  {t('photoGallery.uploadedAt', {
                    when: new Date(lightbox.created_at).toLocaleString(),
                  })}
                  {lightbox.uploaded_by_username
                    ? ` ${t('photoGallery.uploadedBy', { user: lightbox.uploaded_by_username })}`
                    : ''}
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t('photoGallery.deleteConfirm'))) {
                      deleteMutation.mutate(lightbox.id)
                    }
                  }}
                  className="btn btn-danger inline-flex items-center gap-1.5 text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('photoGallery.delete')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
