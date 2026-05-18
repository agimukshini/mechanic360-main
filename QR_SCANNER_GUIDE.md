# QR Code Scanner Implementation

## What Was Fixed

The QR/barcode scanner has been fully implemented and integrated into the Workshop360 application.

## Changes Made

### 1. Frontend - QR Scanner Component
- **File**: `frontend/src/components/QRScanner.tsx` (new)
- Uses `html5-qrcode` library for camera-based QR/barcode scanning
- Features:
  - Real-time camera preview
  - Automatic vehicle lookup after scan
  - Error handling for camera permissions
  - Responsive modal UI matching Workshop360 design
  - Loading states during lookup

### 2. Frontend - Vehicle List Integration
- **File**: `frontend/src/pages/vehicles/VehiclesList.tsx`
- Replaced placeholder alert with functional scanner
- Scanner modal opens when clicking "Scan QR Code" button
- Automatically navigates to vehicle details after successful scan
- Handles multiple matches by setting search filter

### 3. Backend - Vehicle Lookup Endpoint
- **File**: `backend/vehicles/views.py`
- Added `/api/v1/vehicles/lookup/` endpoint
- Accepts `code` query parameter
- Searches by:
  - Exact vehicle ID
  - License plate (exact or partial)
  - VIN (exact or partial)
  - Owner name (partial)
- Returns single vehicle or list of matches

### 4. Frontend API
- **File**: `frontend/src/api/index.ts`
- Added `vehiclesApi.lookup(code)` method

## How to Use

### Scanning a Vehicle QR Code

1. Navigate to **Vehicle Check-In** page
2. Click the **"Scan QR Code"** button (dark card with QR icon)
3. Allow camera access when prompted
4. Point camera at vehicle QR sticker
5. Application automatically:
   - Decodes QR code
   - Looks up vehicle in database
   - Navigates to vehicle details page

### Generating QR Codes for Vehicles

Each vehicle should have a QR code containing one of:
- Vehicle ID (UUID)
- License plate number
- VIN number

**Recommended format**: `https://workshop360.app/vehicles/{vehicle_id}`

Or simply the vehicle ID: `{vehicle_id}`

#### Example QR Code Generation (Python)

```python
import qrcode
from django.conf import settings

def generate_vehicle_qr(vehicle):
    """Generate QR code for a vehicle"""
    # Option 1: Full URL
    qr_data = f"https://workshop360.app/vehicles/{vehicle.id}"
    
    # Option 2: Just the ID
    # qr_data = str(vehicle.id)
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_data)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Save to file
    filename = f"vehicle_{vehicle.license_plate}_qr.png"
    img.save(filename)
    
    return filename
```

#### Example QR Code Generation (JavaScript/TypeScript)

```typescript
import QRCode from 'qrcode'

async function generateVehicleQR(vehicleId: string) {
  const qrData = `https://workshop360.app/vehicles/${vehicleId}`
  // Or just: const qrData = vehicleId
  
  const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
    width: 256,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  })
  
  return qrCodeDataUrl
}
```

## Testing

### Manual Testing Steps

1. **Start the application**:
   ```bash
   docker-compose up -d
   ```

2. **Login** to the application (admin/admin123 for demo)

3. **Create a test vehicle**:
   - Go to Vehicles → Add Vehicle
   - Fill in details (e.g., License Plate: TEST001)
   - Save

4. **Generate a QR code** for the vehicle:
   - Use the vehicle ID or license plate
   - Create QR code using any QR generator tool
   - Print or display on screen

5. **Test the scanner**:
   - Go to Vehicle Check-In page
   - Click "Scan QR Code"
   - Allow camera access
   - Scan the QR code
   - Verify navigation to vehicle details

### Testing with Browser DevTools

For testing without a physical camera:
1. Open Chrome DevTools (F12)
2. Go to Application → Service Workers
3. Use the "Offline" toggle to simulate poor connectivity
4. Test error handling

## Camera Permissions

The scanner requires camera access. Users will see a browser prompt asking for permission.

**Common issues**:
- **Camera not found**: Ensure device has a working camera
- **Permission denied**: User must allow camera access in browser settings
- **HTTPS required**: Camera API requires secure context (HTTPS or localhost)

## API Reference

### Vehicle Lookup Endpoint

**Endpoint**: `GET /api/v1/vehicles/lookup/`

**Parameters**:
- `code` (string, required): QR code data to look up

**Response** (single match):
```json
{
  "id": "uuid",
  "license_plate": "ABC123",
  "vin": "1HGCM82633A004352",
  "make": "Toyota",
  "model": "Camry",
  "year": 2020,
  "owner": {
    "id": "uuid",
    "name": "John Doe"
  }
}
```

**Response** (multiple matches):
```json
[
  {
    "id": "uuid1",
    "license_plate": "ABC123",
    ...
  },
  {
    "id": "uuid2",
    "license_plate": "ABC1234",
    ...
  }
]
```

**Error Response** (404):
```json
{
  "error": "Vehicle not found"
}
```

## Dependencies

- **Frontend**: `html5-qrcode` (installed)
- **Backend**: No new dependencies
- **QR Generation**: `qrcode` library (optional, for generating QR codes)

## Future Enhancements

Potential improvements:
- [ ] Batch scanning for multiple vehicles
- [ ] QR code generation endpoint in backend
- [ ] Print QR codes for all vehicles
- [ ] Offline scanning with local cache
- [ ] Barcode support (1D barcodes in addition to QR)
- [ ] Scan history tracking

## Troubleshooting

### Scanner doesn't open
- Check browser console for errors
- Ensure camera permissions are granted
- Try using HTTPS or localhost

### Scan doesn't work
- Ensure QR code is clear and not damaged
- Check lighting conditions
- Verify QR code contains valid vehicle ID/license plate/VIN
- Test with browser DevTools camera emulation

### Vehicle not found after scan
- Verify vehicle exists in database
- Check QR code contains correct identifier
- Review backend logs for lookup errors
- Test lookup endpoint manually with curl/Postman

## Notes

- The scanner uses the device's back camera by default (better for scanning)
- On desktop, it uses the default camera
- Scanning interval is set to 10 FPS for performance
- QR code box size is 250x250 pixels for optimal scanning
