import { useRef, useState } from 'react'
import { Upload, X, FileSpreadsheet, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface BulkUploadModalProps {
  onClose: () => void
  onUpload: (file: File) => Promise<void>
}

export default function BulkUploadModal({ onClose, onUpload }: BulkUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.xlsx')) {
      setError('Only .xlsx files are supported')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Max 10MB')
      return
    }

    setError(null)
    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setIsUploading(true)
    setError(null)

    try {
      await onUpload(selectedFile)
      setSuccess(true)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDownloadTemplate = () => {
    // Create a simple CSV template
    const headers = ['sku', 'name', 'manufacturer', 'supplier', 'purchase_cost', 'sale_price', 'current_stock', 'minimum_stock']
    const sample = [
      'OIL-001,Engine Oil 5W-30,Mobil,AutoParts Inc,15.00,25.00,50,10',
      'FLT-001,Oil Filter,Bosch,AutoParts Inc,5.00,12.00,100,20',
      'BRK-001,Brake Pads (Front),Brembo,BrakeShop,35.00,55.00,25,5',
    ]
    const csv = [headers.join(','), ...sample].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'inventory_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Bulk Upload</h3>
              <p className="text-xs text-gray-500">Import inventory items from Excel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {success && result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="font-semibold text-green-800">Import Complete!</p>
                  <p className="text-sm text-green-700 mt-0.5">
                    {result.created} created, {result.updated} updated, {result.skipped} skipped
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Info */}
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <p className="text-xs text-blue-800 font-medium mb-1">Required columns:</p>
                <p className="text-xs text-blue-700">sku, name</p>
                <p className="text-xs text-blue-800 font-medium mt-2 mb-1">Optional columns:</p>
                <p className="text-xs text-blue-700">manufacturer, supplier, purchase_cost, sale_price, current_stock, minimum_stock</p>
              </div>

              {/* Download Template */}
              <button
                onClick={handleDownloadTemplate}
                className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <Upload className="w-4 h-4" />
                Download CSV Template
              </button>

              {/* File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileSelect}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
              >
                {selectedFile ? (
                  <>
                    <FileSpreadsheet className="w-8 h-8 text-green-500 mb-2" />
                    <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600">Click to select .xlsx file</p>
                    <p className="text-xs text-gray-400 mt-0.5">Max 10MB</p>
                  </>
                )}
              </button>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || isUploading}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
