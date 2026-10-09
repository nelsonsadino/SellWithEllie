import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useTenant } from '../context/TenantContext'
import { onWishlistChange, wishlistCount } from '../lib/wishlist'
import ThemeToggle from './ThemeToggle'

export default function Navbar() {
  const { isAuthenticated, isAdmin, user, logout } = useAuth()
  const { count } = useCart()
  const { tenant } = useTenant()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [saved, setSaved] = useState(() => wishlistCount())
  const navigate = useNavigate()

  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => onWishlistChange(() => setSaved(wishlistCount())), [])

  const handleLogout = () => {
    logout()
    closeMenu()
    navigate('/')
  }

  return (
    <header className={`navbar ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container navbar-inner">
        <Link to="/" className="navbar-brand" onClick={closeMenu}>
          {tenant?.name || 'Shop'}
        </Link>

        <button
          className="navbar-toggle"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav id="primary-navigation" className={`navbar-links ${menuOpen ? 'open' : ''}`}>
          <NavLink to="/products" onClick={closeMenu}>
            Shop
          </NavLink>
          <NavLink to="/auctions" onClick={closeMenu}>
            Auctions
          </NavLink>
          <NavLink to="/raffles" onClick={closeMenu}>
            Raffles
          </NavLink>
          <NavLink to="/about" onClick={closeMenu}>
            About
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" onClick={closeMenu}>
              Admin
            </NavLink>
          )}

          <ThemeToggle />

          <Link to="/wishlist" className="navbar-save" onClick={closeMenu} aria-label={`Saved items (${saved})`}>
            ♡ Saved
            {saved > 0 && <span className="cart-badge">{saved}</span>}
          </Link>

          <Link to="/cart" className="navbar-cart" onClick={closeMenu}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="17" height="17" aria-hidden="true">
              <path d="M3 4h2l2.2 11.4a2 2 0 0 0 2 1.6h7.3a2 2 0 0 0 2-1.6L20 8H6" />
              <circle cx="9.5" cy="20" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="17" cy="20" r="1.4" fill="currentColor" stroke="none" />
            </svg>
            Cart
            {count > 0 && <span className="cart-badge">{count}</span>}
          </Link>

          {isAuthenticated ? (
            <div className="navbar-user">
              <Link to="/orders" onClick={closeMenu}>
                {user?.displayName || 'My account'}
              </Link>
              <button className="btn btn-secondary btn-small" onClick={handleLogout}>
                Log out
              </button>
            </div>
          ) : (
            <div className="navbar-user">
              <Link to="/login" onClick={closeMenu} className="btn btn-secondary btn-small">
                Log in
              </Link>
              <Link to="/register" onClick={closeMenu} className="btn btn-primary btn-small">
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}
