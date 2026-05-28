import axios from 'axios'

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

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshUrl = API_URL.startsWith('http')
          ? `${API_URL}/auth/token/refresh/`
          : '/api/v1/auth/token/refresh/'
        await axios.post(refreshUrl, {}, { withCredentials: true })
        return api(originalRequest)
      } catch {
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login'
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
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    api.patch('/auth/settings/', {
      current_password: currentPassword,
      password: newPassword,
      confirm_password: confirmPassword,
    }),
  register: (data: { username: string; email: string; password: string; role: string }) =>
    api.post('/auth/register/', data),
}

// Tenants API
export const tenantsApi = {
  register: (data: {
    workshop_name: string
    admin_username: string
    admin_email: string
    admin_password: string
    website?: string
  }) => api.post('/tenants/register/', data),
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

// Vehicles API
export const vehiclesApi = {
  list: (params?: object) => api.get('/vehicles/', { params }),
  get: (id: string) => api.get(`/vehicles/${id}/`),
  create: (data: object) => api.post('/vehicles/', data),
  update: (id: string, data: object) => api.put(`/vehicles/${id}/`, data),
  patch: (id: string, data: object) => api.patch(`/vehicles/${id}/`, data),
  delete: (id: string) => api.delete(`/vehicles/${id}/`),
  lookup: (code: string) => api.get('/vehicles/lookup/', { params: { code } }),
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
