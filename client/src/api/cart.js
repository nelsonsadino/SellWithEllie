import { apiClient } from './client'

export const getCart = () => apiClient.get('/cart', { auth: true })
export const addToCart = (productId, quantity = 1) =>
  apiClient.post(`/cart/${productId}`, { quantity }, { auth: true })
export const setCartQuantity = (productId, quantity) =>
  apiClient.put(`/cart/${productId}`, { quantity }, { auth: true })
export const removeFromCart = (productId) => apiClient.delete(`/cart/${productId}`, { auth: true })
export const checkout = (payload) => apiClient.post('/cart/checkout', payload, { auth: true })
