import { apiClient } from './client'

const toQuery = (params) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, v)
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const getMyOrders = (params = {}) => apiClient.get(`/orders${toQuery(params)}`, { auth: true })
export const getMyOrderCounts = () => apiClient.get('/orders/counts', { auth: true })
export const getOrder = (id) => apiClient.get(`/orders/${id}`, { auth: true })
export const getAllOrders = (params = {}) => apiClient.get(`/orders/admin/all${toQuery(params)}`, { auth: true })
