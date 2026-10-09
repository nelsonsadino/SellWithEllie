import { apiClient } from './client'

export const getProducts = (params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const query = search.toString()
  return apiClient.get(`/products${query ? `?${query}` : ''}`)
}

export const getProductCategories = () => apiClient.get('/products/categories')
export const getProduct = (id) => apiClient.get(`/products/${id}`)

// ---- Admin: inventory management ----------------------------------------
// params: { search, category, stockStatus: 'in'|'low'|'out'|'auction', sort, page, pageSize }
export const getInventory = (params = {}) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, v)
  })
  const s = q.toString()
  return apiClient.get(`/products/inventory${s ? `?${s}` : ''}`, { auth: true })
}

// body: { setTo } or { adjustBy }
export const adjustStock = (id, body) =>
  apiClient.patch(`/products/${id}/stock`, body, { auth: true })
export const createProduct = (payload) => apiClient.post('/products', payload, { auth: true })
export const updateProduct = (id, payload) => apiClient.put(`/products/${id}`, payload, { auth: true })
export const deleteProduct = (id) => apiClient.delete(`/products/${id}`, { auth: true })

export const uploadProductMedia = (productId, files) => {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  return apiClient.postForm(`/products/${productId}/media`, formData, { auth: true })
}

export const deleteProductMedia = (productId, mediaId) =>
  apiClient.delete(`/products/${productId}/media/${mediaId}`, { auth: true })
