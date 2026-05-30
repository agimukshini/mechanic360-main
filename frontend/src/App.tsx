import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { restoreSession } from './store/authSlice'
import type { RootState, AppDispatch } from './store'
import RoleGuard from './components/auth/RoleGuard'
import { isOwnerRole, normalizeRole } from './lib/roles'

// Pages
import LandingPage from './pages/auth/LandingPage'
import RegisterChooserPage from './pages/auth/RegisterChooserPage'
import SignInPage from './pages/auth/SignInPage'
import TenantRegisterPage from './pages/auth/TenantRegisterPage'
import OwnerRegisterPage from './pages/owner/OwnerRegisterPage'
import OwnerVehiclesList from './pages/owner/OwnerVehiclesList'
import OwnerVehicleDetail from './pages/owner/OwnerVehicleDetail'
import OwnerClaimPage from './pages/owner/OwnerClaimPage'
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
import MechanicsAnalyticsPage from './pages/analytics/MechanicsAnalyticsPage'
import MarketplaceList from './pages/marketplace/MarketplaceList'
import SellerDashboard from './pages/marketplace/SellerDashboard'
import SellerPartForm from './pages/marketplace/SellerPartForm'
import MaintenanceOrdersList from './pages/maintenance/MaintenanceOrdersList'
import SettingsPage from './pages/settings/SettingsPage'
import WorkshopLoginAuditPage from './pages/settings/WorkshopLoginAuditPage'
import TeamPage from './pages/settings/TeamPage'
import StaffInviteAcceptPage from './pages/auth/StaffInviteAcceptPage'
import SuperAdminLayout from './components/layout/SuperAdminLayout'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminTenantsPage from './pages/admin/AdminTenantsPage'
import AdminTenantDetailPage from './pages/admin/AdminTenantDetailPage'
import AdminGlobalPage from './pages/admin/AdminGlobalPage'
import TenantOnboardingAdminPage from './pages/admin/TenantOnboardingAdminPage'
import AdminLoginAuditPage from './pages/admin/AdminLoginAuditPage'
import AdminTransfersPage from './pages/admin/AdminTransfersPage'
import AdminVehicleAuditPage from './pages/admin/AdminVehicleAuditPage'
import AdminTranslationCoveragePage from './pages/admin/AdminTranslationCoveragePage'
import AdminInvoicesPage from './pages/admin/AdminInvoicesPage'
import AdminSubscriptionsPage from './pages/admin/AdminSubscriptionsPage'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading, sessionChecked, user } = useSelector((state: RootState) => state.auth)

  if (!sessionChecked || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  if (isOwnerRole(normalizeRole(user?.role))) {
    return <Navigate to="/owner/vehicles" replace />
  }

  if (user?.is_superuser) {
    return <Navigate to="/admin" replace />
  }

  return <>{children}</>
}

const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading, sessionChecked, user } = useSelector((state: RootState) => state.auth)

  if (!sessionChecked || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  if (!user?.is_superuser) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

const OwnerProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading, sessionChecked, user } = useSelector((state: RootState) => state.auth)

  if (!sessionChecked || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  if (!isOwnerRole(normalizeRole(user?.role))) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function App() {
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    dispatch(restoreSession())
  }, [dispatch])

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<SignInPage />} />
      <Route path="/register" element={<RegisterChooserPage />} />
      <Route path="/register/mechanic" element={<TenantRegisterPage />} />
      <Route path="/register/owner" element={<OwnerRegisterPage />} />
      <Route path="/owner/register" element={<Navigate to="/register/owner" replace />} />
      <Route path="/invite/staff/:token" element={<StaffInviteAcceptPage />} />

      <Route
        path="/admin"
        element={
          <SuperAdminRoute>
            <SuperAdminLayout />
          </SuperAdminRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="tenants" element={<AdminTenantsPage />} />
        <Route path="tenants/:id" element={<AdminTenantDetailPage />} />
        <Route path="onboarding" element={<TenantOnboardingAdminPage />} />
        <Route path="global" element={<AdminGlobalPage />} />
        <Route path="transfers" element={<AdminTransfersPage />} />
        <Route path="audit" element={<AdminVehicleAuditPage />} />
        <Route path="security/logins" element={<AdminLoginAuditPage />} />
        <Route path="translation-coverage" element={<AdminTranslationCoveragePage />} />
        <Route path="invoices" element={<AdminInvoicesPage />} />
        <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
      </Route>

      <Route
        path="/owner/vehicles"
        element={
          <OwnerProtectedRoute>
            <OwnerVehiclesList />
          </OwnerProtectedRoute>
        }
      />
      <Route
        path="/owner/vehicles/:id"
        element={
          <OwnerProtectedRoute>
            <OwnerVehicleDetail />
          </OwnerProtectedRoute>
        }
      />
      <Route
        path="/owner/claim"
        element={
          <OwnerProtectedRoute>
            <OwnerClaimPage />
          </OwnerProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />

        <Route
          path="clients"
          element={
            <RoleGuard mode="workshop_manage">
              <ClientsList />
            </RoleGuard>
          }
        />
        <Route
          path="clients/new"
          element={
            <RoleGuard mode="workshop_manage">
              <ClientForm />
            </RoleGuard>
          }
        />
        <Route
          path="clients/:id"
          element={
            <RoleGuard mode="workshop_manage">
              <ClientDetail />
            </RoleGuard>
          }
        />
        <Route
          path="clients/:id/edit"
          element={
            <RoleGuard mode="workshop_manage">
              <ClientForm />
            </RoleGuard>
          }
        />

        <Route path="vehicles" element={<VehiclesList />} />
        <Route path="vehicles/new" element={<VehicleForm />} />
        <Route path="vehicles/:id" element={<VehicleDetail />} />
        <Route path="vehicles/:id/edit" element={<VehicleForm />} />

        <Route path="visits" element={<VisitsList />} />
        <Route
          path="visits/new"
          element={
            <RoleGuard mode="workshop_manage">
              <VisitForm />
            </RoleGuard>
          }
        />
        <Route path="visits/:id" element={<VisitDetail />} />
        <Route
          path="visits/:id/edit"
          element={
            <RoleGuard mode="workshop_manage">
              <VisitForm />
            </RoleGuard>
          }
        />

        <Route path="inspections-list" element={<InspectionsList />} />
        <Route path="visits/:visitId/inspection/new" element={<InspectionForm />} />
        <Route path="inspections/:id" element={<InspectionDetail />} />
        <Route path="inspections/:id/edit" element={<InspectionForm />} />

        <Route
          path="inventory"
          element={
            <RoleGuard mode="workshop_manage">
              <InventoryList />
            </RoleGuard>
          }
        />
        <Route
          path="inventory/new"
          element={
            <RoleGuard mode="workshop_manage">
              <InventoryForm />
            </RoleGuard>
          }
        />
        <Route
          path="inventory/:id/edit"
          element={
            <RoleGuard mode="workshop_manage">
              <InventoryForm />
            </RoleGuard>
          }
        />

        <Route
          path="services"
          element={
            <RoleGuard mode="catalog">
              <ServiceCatalogList />
            </RoleGuard>
          }
        />
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
        <Route
          path="analytics/mechanics"
          element={
            <RoleGuard mode="mechanics_kpi">
              <MechanicsAnalyticsPage />
            </RoleGuard>
          }
        />
        <Route
          path="analytics/mechanics/:id"
          element={
            <RoleGuard mode="mechanics_kpi">
              <MechanicsAnalyticsPage />
            </RoleGuard>
          }
        />

        <Route
          path="maintenance-orders"
          element={
            <RoleGuard mode="marketplace_browse">
              <MaintenanceOrdersList />
            </RoleGuard>
          }
        />

        <Route
          path="marketplace"
          element={
            <RoleGuard mode="marketplace_browse">
              <MarketplaceList />
            </RoleGuard>
          }
        />
        <Route
          path="marketplace/seller"
          element={
            <RoleGuard mode="workshop_manage">
              <SellerDashboard />
            </RoleGuard>
          }
        />
        <Route
          path="marketplace/seller/new"
          element={
            <RoleGuard mode="workshop_manage">
              <SellerPartForm />
            </RoleGuard>
          }
        />
        <Route
          path="marketplace/seller/:id/edit"
          element={
            <RoleGuard mode="workshop_manage">
              <SellerPartForm />
            </RoleGuard>
          }
        />

        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="settings/team"
          element={
            <RoleGuard mode="tenant_admin">
              <TeamPage />
            </RoleGuard>
          }
        />
        <Route
          path="settings/login-log"
          element={
            <RoleGuard mode="tenant_admin">
              <WorkshopLoginAuditPage />
            </RoleGuard>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
