import { Route, Routes, useNavigate } from 'react-router-dom'
import { PlatformAdminRoute } from '../components/RouteGuards'
import SkipLink from '../components/SkipLink'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import NotFoundPage from '../pages/NotFoundPage'
import PlatformDashboardPage from '../pages/platform/PlatformDashboardPage'
import PlatformLoginPage from '../pages/platform/PlatformLoginPage'

function PlatformHeader() {
  const { isAuthenticated, user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="platform-header">
      <div className="container platform-header-inner">
        <span>🐾 Platform console</span>
        <div className="navbar-actions">
          <ThemeToggle />
          {isAuthenticated && (
            <div className="navbar-user">
              <span>{user?.displayName}</span>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => {
                  logout()
                  navigate('/login')
                }}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default function PlatformApp() {
  return (
    <div className="platform-shell">
      <SkipLink />
      <PlatformHeader />
      <main className="app-main" id="main">
        <Routes>
          <Route path="/login" element={<PlatformLoginPage />} />
          <Route
            path="/"
            element={
              <PlatformAdminRoute>
                <PlatformDashboardPage />
              </PlatformAdminRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  )
}
