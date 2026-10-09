import { apiClient } from './client'

// ---- Reviews & related products -----------------------------------------
export const getReviews = (productId) => apiClient.get(`/products/${productId}/reviews`)
export const postReview = (productId, body) => apiClient.post(`/products/${productId}/reviews`, body, { auth: true })
export const deleteReview = (productId, id) => apiClient.delete(`/products/${productId}/reviews/${id}`, { auth: true })
export const getRelated = (productId) => apiClient.get(`/products/${productId}/related`)

// ---- Shipping & coupons --------------------------------------------------
export const getShippingMethods = () => apiClient.get('/shipping-methods')
export const quote = (payload) => apiClient.post('/coupons/quote', payload)

// ---- Admin ---------------------------------------------------------------
export const getAllShippingMethods = () => apiClient.get('/shipping-methods/all', { auth: true })
export const createShippingMethod = (p) => apiClient.post('/shipping-methods', p, { auth: true })
export const updateShippingMethod = (id, p) => apiClient.put(`/shipping-methods/${id}`, p, { auth: true })
export const deleteShippingMethod = (id) => apiClient.delete(`/shipping-methods/${id}`, { auth: true })

export const getCoupons = () => apiClient.get('/coupons', { auth: true })
export const createCoupon = (p) => apiClient.post('/coupons', p, { auth: true })
export const setCouponActive = (id, active) => apiClient.put(`/coupons/${id}/active?active=${active}`, {}, { auth: true })
export const deleteCoupon = (id) => apiClient.delete(`/coupons/${id}`, { auth: true })

// ---- Guest checkout & tracking -------------------------------------------
export const guestCheckout = (payload) => apiClient.post('/orders/guest', payload)
export const trackOrder = (orderId, email) =>
  apiClient.get(`/orders/track?orderId=${encodeURIComponent(orderId)}&email=${encodeURIComponent(email)}`)
export const updateFulfillment = (id, payload) => apiClient.put(`/orders/${id}/fulfillment`, payload, { auth: true })
