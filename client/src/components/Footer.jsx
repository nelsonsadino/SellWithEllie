import { Link, useNavigate } from 'react-router-dom'
import { useOptionalTenant } from '../context/TenantContext'
import { useAuth } from '../context/AuthContext'

export default function Footer() {
  const tenant = useOptionalTenant()?.tenant || null
  const shopName = tenant?.name || 'This shop'
  const addr = tenant?.slug ? `${tenant.slug}.sellwithellie.com` : null
  const { isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <strong>{shopName}</strong>
          <p>An independent shop on SellWithEllie — storefront &amp; live auctions.</p>
          {addr && <p className="footer-addr">{addr}</p>}
        </div>
        <div>
          <p className="footer-col-title">Browse</p>
          <div className="footer-links">
            <Link to="/products">Shop</Link>
            <Link to="/auctions">Auctions</Link>
            <Link to="/about">About</Link>
          </div>
        </div>
        <div>
          <p className="footer-col-title">Account</p>
          <div className="footer-links">
            <Link to="/orders">Orders</Link>
            <Link to="/cart">Cart</Link>
            {isAuthenticated ? (
              <button type="button" className="footer-link-btn" onClick={handleLogout}>
                Log out
              </button>
            ) : (
              <Link to="/login">Log in</Link>
            )}
          </div>
        </div>
        <p className="footer-copyright">
          © {new Date().getFullYear()} {shopName} · Powered by SellWithEllie
        </p>
      </div>
    </footer>
  )
}
