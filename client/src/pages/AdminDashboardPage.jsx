import { lazy, Suspense, useState } from 'react'
import Spinner from '../components/Spinner'

// Lazy-loaded: each panel only downloads when its tab is opened, instead
// of every shopper-facing bundle paying for all ~1,500 lines of admin UI.
const AdminProductsPanel = lazy(() => import('./admin/AdminProductsPanel'))
const AdminAuctionsPanel = lazy(() => import('./admin/AdminAuctionsPanel'))
const AdminRafflesPanel = lazy(() => import('./admin/AdminRafflesPanel'))
const AdminOrdersPanel = lazy(() => import('./admin/AdminOrdersPanel'))
const AdminStorefrontPanel = lazy(() => import('./admin/AdminStorefrontPanel'))
const AdminPaymentsPanel = lazy(() => import('./admin/AdminPaymentsPanel'))
const AdminBillingPanel = lazy(() => import('./admin/AdminBillingPanel'))
const AdminAuditLogPanel = lazy(() => import('./admin/AdminAuditLogPanel'))

const AdminPromotionsPanel = lazy(() => import('./admin/AdminPromotionsPanel'))
const AdminReportsPanel = lazy(() => import('./admin/AdminReportsPanel'))

const TABS = [
  { key: 'reports', label: 'Reports', Component: AdminReportsPanel },
  { key: 'products', label: 'Inventory', Component: AdminProductsPanel },
  { key: 'auctions', label: 'Auctions', Component: AdminAuctionsPanel },
  { key: 'raffles', label: 'Raffles', Component: AdminRafflesPanel },
  { key: 'orders', label: 'Orders', Component: AdminOrdersPanel },
  { key: 'promotions', label: 'Promotions', Component: AdminPromotionsPanel },
  { key: 'storefront', label: 'Storefront', Component: AdminStorefrontPanel },
  { key: 'payments', label: 'Payments', Component: AdminPaymentsPanel },
  { key: 'billing', label: 'Billing', Component: AdminBillingPanel },
  { key: 'audit-log', label: 'Audit log', Component: AdminAuditLogPanel },
]

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState('reports')
  const ActiveComponent = TABS.find((t) => t.key === activeTab)?.Component

  return (
    <div className="container section">
      <div className="page-header">
        <h1>Admin dashboard</h1>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <Suspense fallback={<Spinner />}>
        {ActiveComponent && <ActiveComponent />}
      </Suspense>
    </div>
  )
}
