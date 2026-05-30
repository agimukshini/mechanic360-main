import axios from 'axios'
import { isPublicPath } from '@/lib/publicPaths'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Let the browser set multipart boundaries for file uploads
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    if (config.headers && 'Content-Type' in config.headers) {
      delete config.headers['Content-Type']
    }
  }
  return config
})

// Response interceptor — refresh session via httpOnly cookie
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    const requestUrl = originalRequest?.url ?? ''
    const isAuthRequest =
      requestUrl.includes('/auth/token/refresh/') || requestUrl.includes('/auth/token/')

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthRequest
    ) {
      originalRequest._retry = true

      try {
        const refreshUrl = API_URL.startsWith('http')
          ? `${API_URL}/auth/token/refresh/`
          : '/api/v1/auth/token/refresh/'
        await axios.post(refreshUrl, {}, { withCredentials: true })
        return api(originalRequest)
      } catch {
        const path = window.location.pathname
        if (!isPublicPath(path)) {
          window.location.href = '/'
        }
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  },
)

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/token/', { username, password }),
  loginWithPin: (username: string, pin: string) =>
    api.post('/auth/token/pin/', { username, pin }),
  logout: () => api.post('/auth/logout/'),
  refreshToken: () => api.post('/auth/token/refresh/', {}),
  getMe: () => api.get('/auth/me/'),
  getSettings: () => api.get('/auth/settings/'),
  updateSettings: (data: object) => api.patch('/auth/settings/', data),
  getLoginAudit: (params?: Record<string, string>) =>
    api.get('/auth/login-audit/', { params }),
  getAdminLoginAudit: (params?: Record<string, string>) =>
    api.get('/auth/admin/login-audit/', { params }),
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    api.patch('/auth/settings/', {
      current_password: currentPassword,
      password: newPassword,
      confirm_password: confirmPassword,
    }),
  register: (data: { username: string; email: string; password: string; role: string }) =>
    api.post('/auth/register/', data),
  listTenantUsers: () => api.get('/auth/tenant/users/'),
  getTenantUser: (id: string) => api.get(`/auth/tenant/users/${id}/`),
  createTenantUser: (data: object) => api.post('/auth/tenant/users/', data),
  updateTenantUser: (id: string, data: object) => api.patch(`/auth/tenant/users/${id}/`, data),
  deleteTenantUser: (id: string) => api.delete(`/auth/tenant/users/${id}/`),
  listMechanics: () => api.get('/auth/tenant/mechanics/'),
  listStaffInvites: () => api.get('/auth/tenant/invites/'),
  createStaffInvite: (data: object) => api.post('/auth/tenant/invites/', data),
  staffInvitePreview: (tokenId: string) => api.get(`/auth/staff-invite/${tokenId}/preview/`),
  acceptStaffInvite: (tokenId: string, data: object) =>
    api.post(`/auth/staff-invite/${tokenId}/accept/`, data),
}

// Tenants API
export const tenantsApi = {
  register: (data: {
    workshop_name: string
    admin_username: string
    admin_email: string
    admin_password: string
    address?: string
    contact_email?: string
    contact_phone?: string
    website?: string
  }) => api.post('/tenants/register/', data),
  listOnboardingApplications: (params?: { status?: string }) =>
    api.get('/tenants/admin/onboarding-applications/', { params }),
  approveOnboardingApplication: (id: string) =>
    api.post(`/tenants/admin/onboarding-applications/${id}/approve/`),
  rejectOnboardingApplication: (id: string, reason?: string) =>
    api.post(`/tenants/admin/onboarding-applications/${id}/reject/`, { reason: reason ?? '' }),
  getDashboard: () => api.get('/tenants/admin/dashboard/'),
  getGlobalRegistry: () => api.get('/tenants/admin/global/'),
  list: () => api.get('/tenants/admin/tenants/'),
  get: (id: string) => api.get(`/tenants/admin/tenants/${id}/`),
  update: (id: string, data: object) => api.patch(`/tenants/admin/tenants/${id}/`, data),
  delete: (id: string) => api.delete(`/tenants/admin/tenants/${id}/`),
}

// Clients API
export const clientsApi = {
  list: (params?: object) => api.get('/clients/', { params }),
  get: (id: string) => api.get(`/clients/${id}/`),
  create: (data: object) => api.post('/clients/', data),
  update: (id: string, data: object) => api.put(`/clients/${id}/`, data),
  patch: (id: string, data: object) => api.patch(`/clients/${id}/`, data),
  delete: (id: string) => api.delete(`/clients/${id}/`),
}

// Clients API
export const ownerApi = {
  register: (data: {
    username: string
    email: string
    password: string
    first_name?: string
    last_name?: string
    phone?: string
  }) => api.post('/owner/register/', data),
  listVehicles: () => api.get('/owner/vehicles/'),
  getVehicle: (id: string) => api.get(`/owner/vehicles/${id}/`),
  claimPreview: (token: string) =>
    api.get('/owner/vehicles/claim/preview/', { params: { token } }),
  claim: (token: string) => api.post('/owner/vehicles/claim/', { token }),
  /** Completed visits aggregated across every workshop that touched the car. */
  serviceHistory: (id: string) => api.get(`/owner/vehicles/${id}/service-history/`),
  /** Printable A6 door-jamb sticker (vehicle + QR + last/next service). */
  doorStickerPdf: (id: string, disposition: 'inline' | 'attachment' = 'attachment') =>
    api.get(`/owner/vehicles/${id}/door-sticker/`, {
      params: { disposition },
      responseType: 'blob',
    }),
  /** A4 service-history PDF aggregating visits from every workshop. */
  serviceBookletPdf: (
    id: string,
    disposition: 'inline' | 'attachment' = 'attachment',
  ) =>
    api.get(`/owner/vehicles/${id}/service-booklet/`, {
      params: { disposition },
      responseType: 'blob',
    }),
  /** List transfers the owner is the from/to of, or look up by QR token. */
  listTransfers: (params?: { token?: string }) =>
    api.get('/owner/transfers/', { params }),
  getTransfer: (id: string) => api.get(`/owner/transfers/${id}/`),
  confirmTransfer: (id: string) => api.post(`/owner/transfers/${id}/confirm/`, {}),
}

// Platform-wide (cross-workshop) registry — read-only search from the tenant side.
export const globalVehiclesApi = {
  list: (params?: { search?: string; active?: 'true' | 'false' | 'all' }) =>
    api.get('/global-vehicles/', { params }),
  lookup: (code: string) =>
    api.get('/global-vehicles/lookup/', { params: { code } }),
}

// Ownership-transfer API (workshop side)
export const transfersApi = {
  list: (params?: { vehicle?: string; status?: string }) =>
    api.get('/global-vehicles/transfers/', { params }),
  get: (id: string) => api.get(`/global-vehicles/transfers/${id}/`),
  start: (data: {
    vehicle_id: string
    documents_verified: boolean
    new_license_plate: string
    notes?: string
  }) => api.post('/global-vehicles/transfers/start/', data),
  cancel: (id: string) => api.post(`/global-vehicles/transfers/${id}/cancel/`, {}),
}

// Platform-superadmin transfers + audit
export const adminTransfersApi = {
  list: (params?: object) => api.get('/tenants/transfers/', { params }),
  get: (id: string) => api.get(`/tenants/transfers/${id}/`),
  dispute: (id: string, notes: string) =>
    api.post(`/tenants/transfers/${id}/dispute/`, { notes }),
  reverse: (id: string, notes: string) =>
    api.post(`/tenants/transfers/${id}/reverse/`, { notes }),
  updateBilling: (
    id: string,
    data: { payment_status?: string; invoice_reference?: string },
  ) => api.patch(`/tenants/transfers/${id}/billing/`, data),
}

export const vehicleAuditApi = {
  list: (params?: object) => api.get('/tenants/vehicle-audit/', { params }),
  get: (id: string) => api.get(`/tenants/vehicle-audit/${id}/`),
}

// Per-tenant platform billing — what the PLATFORM charges this workshop.
// Distinct from the workshop's own service catalog prices.
export const platformBillingApi = {
  get: (tenantId: string) =>
    api.get(`/tenants/platform-billing/${tenantId}/`),
  update: (
    tenantId: string,
    data: {
      transfer_fee_amount?: string | number
      transfer_fee_currency?: string
      registration_fee_amount?: string | number
      registration_fee_currency?: string
      subscription_fee_amount?: string | number
      subscription_fee_currency?: string
      subscription_period?: 'none' | 'monthly' | 'yearly'
      subscription_next_charge_at?: string | null
      notes?: string
    },
  ) => api.patch(`/tenants/platform-billing/${tenantId}/`, data),
}

export const vehiclePhotosApi = {
  list: (vehicleId: string) =>
    api.get('/vehicles/photos/', { params: { vehicle: vehicleId } }),
  upload: (vehicleId: string, file: File, caption = '', sortOrder = 0) => {
    const fd = new FormData()
    fd.append('vehicle_id', vehicleId)
    fd.append('image', file)
    fd.append('caption', caption)
    fd.append('sort_order', String(sortOrder))
    return api.post('/vehicles/photos/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  update: (
    id: string,
    data: { caption?: string; sort_order?: number },
  ) => api.patch(`/vehicles/photos/${id}/`, data),
  remove: (id: string) => api.delete(`/vehicles/photos/${id}/`),
}

export const ownerPhotosApi = {
  list: (globalVehicleId: string) =>
    api.get(`/owner/vehicles/${globalVehicleId}/photos/`),
}

export const registrationChargesApi = {
  list: (params?: { tenant_id?: string; payment_status?: string }) =>
    api.get('/tenants/registration-charges/', { params }),
  updateBilling: (
    id: string,
    data: { payment_status?: string; invoice_reference?: string },
  ) => api.patch(`/tenants/registration-charges/${id}/billing/`, data),
}

// Vehicles API
export const vehiclesApi = {
  list: (params?: object) => api.get('/vehicles/', { params }),
  get: (id: string) => api.get(`/vehicles/${id}/`),
  create: (data: object) => api.post('/vehicles/', data),
  update: (id: string, data: object) => api.put(`/vehicles/${id}/`, data),
  patch: (id: string, data: object) => api.patch(`/vehicles/${id}/`, data),
  delete: (id: string) => api.delete(`/vehicles/${id}/`),
  lookup: (code: string) => api.get('/vehicles/lookup/', { params: { code } }),
  adoptGlobal: (globalVehicleId: string) =>
    api.post('/vehicles/adopt-global/', { global_vehicle_id: globalVehicleId }),
  ownerClaimQr: (id: string, notes?: string) =>
    api.post(`/vehicles/${id}/owner_claim_qr/`, { notes: notes ?? '' }),
  transferQr: (id: string, documentsVerified: boolean, newLicensePlate: string, notes?: string) =>
    api.post(`/vehicles/${id}/transfer_qr/`, {
      documents_verified: documentsVerified,
      new_license_plate: newLicensePlate,
      notes: notes ?? '',
    }),
  updateRegistration: (id: string, licensePlate: string) =>
    api.patch(`/vehicles/${id}/registration/`, { license_plate: licensePlate }),
  /** Permanent vehicle lookup QR (PNG data URL + extras). */
  qrCode: (id: string) => api.get(`/vehicles/${id}/qr_code/`),
  /** Printable A6 door-sticker PDF (workshop branding + QR + plate). */
  doorStickerPdf: (id: string, disposition: 'inline' | 'attachment' = 'attachment') =>
    api.get(`/vehicles/${id}/door-sticker/`, {
      params: { disposition },
      responseType: 'blob',
    }),
  documents: {
    list: (vehicleId: string) =>
      api.get('/vehicles/documents/', { params: { vehicle: vehicleId } }),
    upload: (vehicleId: string, file: File, name?: string) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('vehicle_id', vehicleId)
      if (name) formData.append('name', name)
      return api.post('/vehicles/documents/', formData)
    },
    delete: (docId: string) => api.delete(`/vehicles/documents/${docId}/`),
  },
}

// Visits API
export const visitsApi = {
  list: (params?: object) => api.get('/visits/', { params }),
  get: (id: string) => api.get(`/visits/${id}/`),
  create: (data: object) => api.post('/visits/', data),
  update: (id: string, data: object) => api.put(`/visits/${id}/`, data),
  patch: (id: string, data: object) => api.patch(`/visits/${id}/`, data),
  delete: (id: string) => api.delete(`/visits/${id}/`),
  startVisit: (id: string) => api.post(`/visits/${id}/start/`),
  completeVisit: (id: string) => api.post(`/visits/${id}/complete/`),
  finishVisit: (id: string, data?: { mileage_km?: number; hour_meter?: number; notes?: string }) =>
    api.post(`/visits/${id}/finish/`, data ?? {}),
  cancelVisit: (id: string) => api.post(`/visits/${id}/cancel/`),
  catalog: {
    list: () => api.get('/visits/catalog/'),
    get: (id: string) => api.get(`/visits/catalog/${id}/`),
    create: (data: object) => api.post('/visits/catalog/', data),
    update: (id: string, data: object) => api.put(`/visits/catalog/${id}/`, data),
    patch: (id: string, data: object) => api.patch(`/visits/catalog/${id}/`, data),
    delete: (id: string) => api.delete(`/visits/catalog/${id}/`),
  },
  serviceLines: {
    list: (params?: object) => api.get('/visits/service-lines/', { params }),
    create: (data: object) => api.post('/visits/service-lines/', data),
  },
  materialLines: {
    list: (params?: object) => api.get('/visits/material-lines/', { params }),
    create: (data: object) => api.post('/visits/material-lines/', data),
  },
  laborLines: {
    list: (params?: object) => api.get('/visits/labor-lines/', { params }),
    create: (data: object) => api.post('/visits/labor-lines/', data),
  },
  maintenancePlans: {
    list: (params?: object) => api.get('/visits/maintenance-plans/', { params }),
    create: (data: object) => api.post('/visits/maintenance-plans/', data),
  },
  analytics: {
    dashboardStats: () => api.get('/visits/analytics/dashboard/'),
    visitsOverview: (params?: object) => api.get('/visits/analytics/visits-overview/', { params }),
    revenueBreakdown: () => api.get('/visits/analytics/revenue/'),
    partsConsumption: () => api.get('/visits/analytics/parts-consumption/'),
    maintenanceForecast: () => api.get('/visits/analytics/maintenance-forecast/'),
    mechanicsSummary: (params?: { days?: number }) =>
      api.get('/visits/analytics/mechanics/', { params }),
    mechanicDetail: (userId: string, params?: { days?: number }) =>
      api.get(`/visits/analytics/mechanics/${userId}/`, { params }),
  },
}

// Inspections API
export const inspectionsApi = {
  list: (params?: object) => api.get('/inspections/', { params }),
  get: (id: string) => api.get(`/inspections/${id}/`),
  create: (data: object) => api.post('/inspections/', data),
  update: (id: string, data: object) => api.patch(`/inspections/${id}/`, data),
  uploadPhoto: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/inspections/upload/', formData)
  },
  deletePhoto: (filename: string) => api.delete(`/inspections/upload/${filename}/`),
}

// Inventory API
export const inventoryApi = {
  list: (params?: object) => api.get('/inventory/items/', { params }),
  get: (id: string) => api.get(`/inventory/items/${id}/`),
  create: (data: object) => api.post('/inventory/items/', data),
  update: (id: string, data: object) => api.put(`/inventory/items/${id}/`, data),
  patch: (id: string, data: object) => api.patch(`/inventory/items/${id}/`, data),
  delete: (id: string) => api.delete(`/inventory/items/${id}/`),
}

export type SparePart = {
  id: string
  listing_type: 'identified' | 'generic'
  listing_type_display?: string
  title: string
  description: string
  part_number?: string
  oem_number?: string
  brand?: string
  alternative_numbers?: string[]
  category: number
  category_slug: string
  category_name: string
  condition: string
  quantity: number
  price: string | number
  currency: string
  seller_name: string
  seller_city?: string
  seller_country?: string
  is_sponsored: boolean
  is_active?: boolean
  is_own?: boolean
  contact_phone?: string
  contact_whatsapp?: string
  contact_email?: string
  compatibility_confirmed?: boolean
}

export type VehicleIssue = {
  id: number
  slug: string
  name: string
  description: string
  mapped_category_slugs: string[]
}

export type PartCategory = {
  id: number
  slug: string
  name: string
}

export type MarketplaceSeller = {
  id: string
  business_name: string
  is_approved: boolean
  location_city?: string
  contact_phone?: string
  contact_whatsapp?: string
  contact_email?: string
}

export const marketplaceApi = {
  listParts: (params?: Record<string, string | number | undefined>) =>
    api.get('/marketplace/parts/', { params }),
  getPart: (id: string) => api.get(`/marketplace/parts/${id}/`),
  createPart: (data: object) => api.post('/marketplace/parts/', data),
  updatePart: (id: string, data: object) => api.patch(`/marketplace/parts/${id}/`, data),
  deletePart: (id: string) => api.delete(`/marketplace/parts/${id}/`),
  listIssues: () => api.get('/marketplace/issues/'),
  listCategories: () => api.get('/marketplace/categories/'),
  getSellerMe: () => api.get('/marketplace/sellers/me/'),
  createSellerMe: () => api.post('/marketplace/sellers/me/'),
  updateSellerMe: (data: object) => api.patch('/marketplace/sellers/me/', data),
  recommendations: (vehicleId: string, issueSlug: string) =>
    api.get('/marketplace/recommendations/', { params: { vehicle: vehicleId, issue: issueSlug } }),
  bannerClick: (eventId: string, partId: string) =>
    api.post(`/marketplace/banner-events/${eventId}/click/`, { part_id: partId }),
  bannerContact: (eventId: string) =>
    api.post(`/marketplace/banner-events/${eventId}/contact/`),
}
