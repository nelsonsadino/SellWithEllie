import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as cartApi from '../api/cart'
import { getProduct } from '../api/products'
import { useAuth } from './AuthContext'
import { clearGuestCart, readGuestCart, writeGuestCart } from '../lib/guestCart'

const CartContext = createContext(null)

// Signed-in shoppers use the server cart. Guests keep {productId, quantity}
// lines in localStorage; each line is re-hydrated from the live product so
// price and stock are never stale. On login the guest lines are merged into
// the account cart.
export function CartProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (isAuthenticated) {
        const pending = readGuestCart()
        if (pending.length > 0) {
          for (const line of pending) {
            try {
              await cartApi.addToCart(line.productId, line.quantity)
            } catch {
              /* out of stock etc. - skip that line */
            }
          }
          clearGuestCart()
        }
        const data = await cartApi.getCart()
        setItems(data.items)
        setTotal(data.total)
        return
      }

      const lines = readGuestCart()
      const rows = await Promise.all(
        lines.map(async (l) => {
          try {
            const p = await getProduct(l.productId)
            if (p.isAuctionOnly) return null
            const qty = Math.min(l.quantity, Math.max(1, p.stockQuantity ?? 1))
            return {
              id: `g${p.id}`,
              productId: p.id,
              productName: p.name,
              productImageUrl: p.imageUrl,
              productCategory: p.category,
              price: p.price,
              quantity: qty,
              availableStock: p.stockQuantity ?? 0,
              lineTotal: p.price * qty,
              inStock: p.inStock
            }
          } catch {
            return null
          }
        })
      )
      const live = rows.filter(Boolean)
      setItems(live)
      setTotal(live.reduce((s, i) => s + i.lineTotal, 0))
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addItem = useCallback(
    async (productId, quantity = 1) => {
      if (isAuthenticated) {
        await cartApi.addToCart(productId, quantity)
      } else {
        const p = await getProduct(productId)
        if (p.isAuctionOnly) throw new Error('This product is only available via auction.')
        if ((p.stockQuantity ?? 0) <= 0) throw new Error('This product is out of stock.')
        const lines = readGuestCart()
        const existing = lines.find((l) => l.productId === productId)
        const desired = (existing?.quantity ?? 0) + quantity
        if (desired > p.stockQuantity) {
          throw new Error(`Only ${p.stockQuantity} of '${p.name}' left.`)
        }
        if (existing) existing.quantity = desired
        else lines.push({ productId, quantity })
        writeGuestCart(lines)
      }
      await refresh()
    },
    [isAuthenticated, refresh]
  )

  const setQuantity = useCallback(
    async (productId, quantity) => {
      if (isAuthenticated) {
        await cartApi.setCartQuantity(productId, quantity)
      } else {
        const lines = readGuestCart()
          .map((l) => (l.productId === productId ? { ...l, quantity } : l))
          .filter((l) => l.quantity > 0)
        writeGuestCart(lines)
      }
      await refresh()
    },
    [isAuthenticated, refresh]
  )

  const removeItem = useCallback(
    async (productId) => {
      if (isAuthenticated) {
        await cartApi.removeFromCart(productId)
      } else {
        writeGuestCart(readGuestCart().filter((l) => l.productId !== productId))
      }
      await refresh()
    },
    [isAuthenticated, refresh]
  )

  const clear = useCallback(() => {
    clearGuestCart()
    setItems([])
    setTotal(0)
  }, [])

  // Badge shows total units, not distinct lines.
  const count = items.reduce((n, i) => n + (i.quantity || 1), 0)

  const value = { items, total, loading, count, refresh, addItem, setQuantity, removeItem, clear }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
