import { useRef, useState } from 'react'
import { X, Image as ImageIcon, Loader2, Camera } from 'lucide-react'
import { shouldOfferCameraCapture } from '@/lib/camera'

interface PhotoUploadProps {
  onUpload: (file: File | null, previewUrl: string) => void
  currentFile?: File | null
  currentPreview?: string
  label?: string
  accept?: string
  maxSizeMB?: number
  /** Use contain so the full subject (e.g. whole vehicle) stays visible */
  objectFit?: 'contain' | 'cover'
  previewHeightClass?: string
  /** When true (default on mobile), tapping opens the back camera directly. */
  enableCameraCapture?: boolean
}

export default function PhotoUpload({
  onUpload,
  currentFile,
  currentPreview,
  label = 'Upload Photo',
  accept = 'image/*',
  maxSizeMB = 10,
  objectFit = 'contain',
  previewHeightClass = 'h-64',
  enableCameraCapture,
}: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(currentPreview)
  const showCameraButton = enableCameraCapture ?? shouldOfferCameraCapture()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate size
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File too large. Max ${maxSizeMB}MB`)
      return
    }

    // Validate type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    setError(null)
    setIsUploading(true)

    // Create a preview URL
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    onUpload(file, objectUrl)
    setIsUploading(false)
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleCameraClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    cameraInputRef.current?.click()
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(undefined)
    onUpload(null, '')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const displayUrl = previewUrl || currentPreview

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      {!displayUrl ? (
        <div className="flex flex-col items-stretch gap-2">
          <button
            type="button"
            onClick={handleClick}
            disabled={isUploading}
            className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50/50 transition-colors disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            ) : (
              <>
                <ImageIcon className="w-8 h-8 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">{label}</p>
                <p className="text-xs text-gray-400">
                  Click or drag image here (max {maxSizeMB}MB)
                </p>
              </>
            )}
          </button>
          {showCameraButton && (
            <button
              type="button"
              onClick={handleCameraClick}
              disabled={isUploading}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:border-blue-400 hover:bg-blue-50/50 disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              Take photo with camera
            </button>
          )}
        </div>
      ) : (
        <div
          className={`relative group w-full ${previewHeightClass} bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden p-2`}
        >
          <img
            src={displayUrl}
            alt="Uploaded"
            className={`max-w-full max-h-full w-auto h-auto rounded ${
              objectFit === 'contain' ? 'object-contain' : 'object-cover w-full h-full'
            }`}
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}

