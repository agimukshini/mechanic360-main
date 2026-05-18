import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { restoreSession } from './store/authSlice'
import type { RootState, AppDispatch } from './store'
import RoleGuard from './components/auth/RoleGuard'

// Pages
import LoginPage from './pages/auth/LoginPage'
import TenantRegisterPage from './pages/auth/TenantRegisterPage'
import DashboardLayout from './components/layout/DashboardLayout'
import Dashboard from './pages/Dashboard'
import ClientsList from './pages/clients/ClientsList'
import ClientForm from './pages/clients/ClientForm'
import ClientDetail from './pages/clients/ClientDetail'
import VehiclesList from './pages/vehicles/VehiclesList'
import VehicleForm from './pages/vehicles/VehicleForm'
import VehicleDetail from './pages/vehicles/VehicleDetail'
import VisitsList from './pages/visits/VisitsList'
import VisitForm from './pages/visits/VisitForm'
import VisitDetail from './pages/visits/VisitDetail'
import InspectionForm from './pages/inspections/InspectionForm'
import InspectionDetail from './pages/inspections/InspectionDetail'
import InspectionsList from './pages/inspections/InspectionsList'
import InventoryList from './pages/inventory/InventoryList'
import InventoryForm from './pages/inventory/InventoryForm'
import ServiceCatalogList from './pages/services/ServiceCatalogList'
import ServiceCatalogForm from './pages/services/ServiceCatalogForm'
import AnalyticsDashboard from './pages/analytics/AnalyticsDashboard'
import MarketplaceList from './pages/marketplace/MarketplaceList'
import MarketplaceForm from './pages/marketplace/MarketplaceForm'
import SettingsPage from './pages/settings/SettingsPage'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading, sessionChecked } = useSelector((state: RootState) => state.auth)

  if (!sessionChecked || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  const dispatch = useDispatch<AppDispatch>()
  const { isAuthenticated, sessionChecked } = useSelector((state: RootState) => state.auth)

  useEffect(() => {
    dispatch(restoreSession())
  }, [dispatch])

  return (
    <Routes>
      <Route
        path="/login"
        element={
          sessionChecked && isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
        }
      />
      <Route
        path="/register"
        element={
          sessionChecked && isAuthenticated ? <Navigate to="/" replace /> : <TenantRegisterPage />
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />

        <Route path="clients" element={<ClientsList />} />
        <Route path="clients/new" element={<ClientForm />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="clients/:id/edit" element={<ClientForm />} />

        <Route path="vehicles" element={<VehiclesList />} />
        <Route path="vehicles/new" element={<VehicleForm />} />
        <Route path="vehicles/:id" element={<VehicleDetail />} />
        <Route path="vehicles/:id/edit" element={<VehicleForm />} />

        <Route path="visits" element={<VisitsList />} />
        <Route path="visits/new" element={<VisitForm />} />
        <Route path="visits/:id" element={<VisitDetail />} />
        <Route path="visits/:id/edit" element={<VisitForm />} />

        <Route path="inspections-list" element={<InspectionsList />} />
        <Route path="visits/:visitId/inspection/new" element={<InspectionForm />} />
        <Route path="inspections/:id" element={<InspectionDetail />} />
        <Route path="inspections/:id/edit" element={<InspectionForm />} />

        <Route path="inventory" element={<InventoryList />} />
        <Route path="inventory/new" element={<InventoryForm />} />
        <Route path="inventory/:id/edit" element={<InventoryForm />} />

        <Route path="services" element={<ServiceCatalogList />} />
        <Route
          path="services/new"
          element={
            <RoleGuard mode="catalog">
              <ServiceCatalogForm />
            </RoleGuard>
          }
        />
        <Route
          path="services/:id/edit"
          element={
            <RoleGuard mode="catalog">
              <ServiceCatalogForm />
            </RoleGuard>
          }
        />

        <Route
          path="analytics"
          element={
            <RoleGuard mode="analytics">
              <AnalyticsDashboard />
            </RoleGuard>
          }
        />

        <Route path="marketplace" element={<MarketplaceList />} />
        <Route path="marketplace/new" element={<MarketplaceForm />} />

        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
