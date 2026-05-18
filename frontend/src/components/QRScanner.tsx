import { useEffect, useRef, useState } from 'react'
import { X, Camera, AlertCircle } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode'

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void
  onScanError?: (error: string) => void
  onClose: () => void
}

export default function QRScanner({ onScanSuccess, onScanError, onClose }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerContainerId = 'html5qr-code-full-region'
  const [scannerState, setScannerState] = useState<'initializing' | 'running' | 'error' | 'camera_select'>('initializing')
  const [errorMessage, setErrorMessage] = useState('')
  const [availableCameras, setAvailableCameras] = useState<any[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')

  useEffect(() => {
    const initScanner = async () => {
      try {
        // Check if camera is available
        const devices = await Html5Qrcode.getCameras()

        if (!devices || devices.length === 0) {
          setScannerState('error')
          setErrorMessage('No camera found on this device. Please connect a camera and try again.')
          onScanError?.('No camera available')
          return
        }

        // Save available cameras for selection
        setAvailableCameras(devices)

        // Prefer back camera on mobile, otherwise use first available camera
        const backCamera = devices.find(device => 
          device.label.toLowerCase().includes('back') ||
          device.label.toLowerCase().includes('environment') ||
          device.label.toLowerCase().includes('rear')
        )
        
        const selectedCamera = backCamera || devices[0]
        setSelectedCameraId(selectedCamera.id)
        
        console.log('Selected camera:', selectedCamera.label, 'ID:', selectedCamera.id)

        const scanner = new Html5Qrcode(scannerContainerId)
        scannerRef.current = scanner

        await scanner.start(
          selectedCamera.id, // Use the camera device ID
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            // Success callback
            onScanSuccess(decodedText)
            stopScanner()
          },
          (errorMessage) => {
            // Error callback (called continuously while scanning)
            // We only care about actual errors, not "no QR code found" messages
            if (errorMessage.includes('NotFoundException')) {
              // This is normal - just means no QR code in frame
              return
            }
            // Log other errors but don't stop scanning
            console.debug('QR scan error:', errorMessage)
          }
        )

        setScannerState('running')
      } catch (err: any) {
        console.error('Failed to initialize scanner:', err)
        setScannerState('error')

        if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
          setErrorMessage('Camera permission denied. Please allow camera access in your browser settings and reload the page.')
        } else if (err.name === 'NotFoundError' || err.message?.includes('No camera')) {
          setErrorMessage('No camera found. Please connect a camera and try again.')
        } else if (err.message?.includes('NotReadable')) {
          setErrorMessage('Camera is being used by another application. Please close other apps using the camera.')
        } else {
          setErrorMessage(`Failed to start camera: ${err.message || 'Unknown error'}. Try using HTTPS or localhost.`)
        }

        onScanError?.(err.message || 'Failed to initialize scanner')
      }
    }

    initScanner()

    return () => {
      stopScanner()
    }
  }, [])

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
          await scannerRef.current.stop()
        }
        scannerRef.current.clear()
      } catch (err) {
        console.error('Failed to stop scanner:', err)
      }
      scannerRef.current = null
    }
  }

  const startScannerWithCamera = async (cameraId: string) => {
    try {
      setScannerState('initializing')
      
      const scanner = new Html5Qrcode(scannerContainerId)
      scannerRef.current = scanner

      await scanner.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          onScanSuccess(decodedText)
          stopScanner()
        },
        (errorMessage) => {
          if (errorMessage.includes('NotFoundException')) {
            return
          }
          console.debug('QR scan error:', errorMessage)
        }
      )

      setScannerState('running')
    } catch (err: any) {
      console.error('Failed to start scanner:', err)
      setScannerState('error')
      setErrorMessage(`Failed to start camera: ${err.message || 'Unknown error'}`)
      onScanError?.(err.message || 'Failed to start scanner')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center">
              <Camera className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Scan QR Code</h2>
              <p className="text-sm text-gray-500">Point camera at vehicle QR sticker</p>
            </div>
          </div>
          <button
            onClick={() => { stopScanner(); onClose() }}
            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Scanner View */}
        <div className="relative bg-black" style={{ minHeight: '400px' }}>
          {scannerState === 'initializing' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-white text-lg font-medium">Initializing camera...</p>
              </div>
            </div>
          )}

          {scannerState === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Camera Error</h3>
                <p className="text-gray-300 mb-6">{errorMessage}</p>
                
                {availableCameras.length > 1 && (
                  <div className="mb-6">
                    <p className="text-white text-sm mb-2">Try a different camera:</p>
                    <select
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                      className="w-full p-3 rounded-lg bg-gray-800 text-white border border-gray-600 mb-3"
                    >
                      {availableCameras.map((camera) => (
                        <option key={camera.id} value={camera.id}>
                          {camera.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div className="flex gap-3 justify-center">
                  {selectedCameraId && (
                    <button
                      onClick={() => startScannerWithCamera(selectedCameraId)}
                      className="btn btn-primary"
                    >
                      Try Camera
                    </button>
                  )}
                  <button
                    onClick={() => { stopScanner(); onClose() }}
                    className="btn btn-secondary"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {scannerState === 'running' && (
            <div id={scannerContainerId} className="w-full" />
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {scannerState === 'running' && 'Scanning... Align QR code within the frame'}
            </p>
            <button
              onClick={() => { stopScanner(); onClose() }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
