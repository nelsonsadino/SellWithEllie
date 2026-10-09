import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { getMarketingSite } from '../../api/marketing'
import SkipLink from '../../components/SkipLink'
import ThemeToggle from '../../components/ThemeToggle'

// A deliberately lightweight shell for the marketing/signup site - it isn't
// scoped to any shop, so it doesn't use Navbar/Footer or TenantProvider. Its
// brand/CTA/footer text is editable by a platform admin (platform console >
// Marketing site); everything falls back to sensible defaults.
export default function MarketingLayout() {
  const [content, setContent] = useState({})

  useEffect(() => {
    let ignore = false
    getMarketingSite()
      .then((data) => {
        if (!ignore) setContent(data.content || {})
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])

  const brand = content['site.name'] || 'SellWithEllie'
  const navCta = content['nav.cta'] || 'Start your shop'
  const footerNote = content['footer.note'] || 'Not affiliated with any single shop.'
  const location = useLocation()
  const onLanding = location.pathname === '/'

  return (
    <div className="app-shell">
      <SkipLink />
      <header className="marketing-nav">
        <div className="container marketing-nav-inner">
          <Link to="/" className="navbar-brand">
            {brand}
          </Link>
          {onLanding && (
            <nav className="marketing-nav-links">
              <a href="#how">How it works</a>
              <a href="#templates">Templates</a>
              <a href="#pricing">Pricing</a>
            </nav>
          )}
          <div className="navbar-actions">
            <ThemeToggle />
            <NavLink to="/signup" className="btn btn-primary btn-small">
              {navCta}
            </NavLink>
          </div>
        </div>
      </header>
      <main className="app-main" id="main">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <p className="footer-copyright">
            © {new Date().getFullYear()} {brand}. {footerNote}
          </p>
        </div>
      </footer>
    </div>
  )
}
