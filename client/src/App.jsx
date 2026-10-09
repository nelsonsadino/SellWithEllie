import { Route, Routes } from 'react-router-dom'
import AnnouncementBar from './components/AnnouncementBar'
import AuctionTicker from './components/AuctionTicker'
import Footer from './components/Footer'
import Navbar from './components/Navbar'
import { AdminRoute, ProtectedRoute } from './components/RouteGuards'
import SkipLink from './components/SkipLink'
import Spinner from './components/Spinner'
import WishlistPage from './pages/WishlistPage'
import { CartProvider } from './context/CartContext'
import { TenantProvider, useTenant } from './context/TenantContext'
import { ThemeProvider } from './context/ThemeContext'
import AboutPage from './pages/AboutPage'
import AdminDashboardPage from './pages/AdminDashboardPage'
import AuctionDetailPage from './pages/AuctionDetailPage'
import AuctionsPage from './pages/AuctionsPage'
import CartPage from './pages/CartPage'
import TrackOrderPage from './pages/TrackOrderPage'
import CheckoutPage from './pages/CheckoutPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import OrderDetailPage from './pages/OrderDetailPage'
import OrdersPage from './pages/OrdersPage'
import ProductDetailPage from './pages/ProductDetailPage'
import ProductsPage from './pages/ProductsPage'
import RaffleDetailPage from './pages/RaffleDetailPage'
import RafflesPage from './pages/RafflesPage'
import RegisterPage from './pages/RegisterPage'

// Everything under a shop's own subdomain - gated on the tenant having
// actually resolved, so a stray/unknown subdomain shows a clear message
// instead of a storefront full of failed API calls.
function ShopApp() {
  const { tenant, loading, error } = useTenant()

  if (loading) {
    return (
      <div className="container section">
        <Spinner />
      </div>
    )
  }

  if (error || !tenant) {
    return (
      <div className="container section empty-state">
        <h2>We couldn't find this shop</h2>
        <p>This address doesn't match a shop on our platform. Double-check the link, or start your own shop.</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <SkipLink />
      <AnnouncementBar />
      <Navbar />
      <AuctionTicker />
      <main className="app-main" id="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/auctions" element={<AuctionsPage />} />
          <Route path="/auctions/:id" element={<AuctionDetailPage />} />
          <Route path="/raffles" element={<RafflesPage />} />
          <Route path="/raffles/:id" element={<RaffleDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/track" element={<TrackOrderPage />} />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <OrdersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <ProtectedRoute>
                <OrderDetailPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboardPage />
              </AdminRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

// Pulls the design template + default light/dark mode off the resolved tenant
// so each shop renders in its chosen look. Falls back to the flagship template
// until the tenant resolves (or if it hasn't set one).
function ThemedShell() {
  const { tenant } = useTenant()
  return (
    <ThemeProvider template={tenant?.themeTemplate} defaultMode={tenant?.themeMode || 'system'}>
      <CartProvider>
        <ShopApp />
      </CartProvider>
    </ThemeProvider>
  )
}

export default function App() {
  return (
    <TenantProvider>
      <ThemedShell />
    </TenantProvider>
  )
}
