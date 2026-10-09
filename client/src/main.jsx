import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import { siteContext } from './lib/siteContext'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/theme.css'

// Which of the three SPAs to render is decided once, from the hostname,
// before anything else mounts - see src/lib/siteContext.js. The marketing
// site and platform console aren't tied to a shop, so they use the fixed
// flagship template; the storefront (App) picks the template up from its
// resolved tenant.
//
// Lazy-loaded so a visitor only ever downloads the JS for the one tree
// their hostname resolves to, instead of all three bundled together.
const App = lazy(() => import('./App.jsx'))
const MarketingApp = lazy(() => import('./apps/MarketingApp.jsx'))
const PlatformApp = lazy(() => import('./apps/PlatformApp.jsx'))

// Matches --color-bg on the flagship template so the fallback doesn't
// flash a different background than the app that mounts after it.
function SiteShellFallback() {
  return <div style={{ minHeight: '100vh', background: '#f2ead9' }} />
}

function SiteRoot() {
  switch (siteContext.mode) {
    case 'marketing':
      return (
        <ThemeProvider template="marketstall">
          <Suspense fallback={<SiteShellFallback />}>
            <MarketingApp />
          </Suspense>
        </ThemeProvider>
      )
    case 'platform':
      return (
        <ThemeProvider template="marketstall">
          <Suspense fallback={<SiteShellFallback />}>
            <PlatformApp />
          </Suspense>
        </ThemeProvider>
      )
    default:
      return (
        <Suspense fallback={<SiteShellFallback />}>
          <App />
        </Suspense>
      )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <SiteRoot />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
)
