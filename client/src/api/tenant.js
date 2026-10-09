import { apiClient } from './client'

// Public storefront bootstrap: shop identity + theme + copy + home-page blocks.
export const getCurrentTenant = () => apiClient.get('/tenant/current')

// ---- Shop-admin: storefront customisation --------------------------------
export const getTenantSettings = () => apiClient.get('/tenant/settings', { auth: true })

export const updateTheme = (themeTemplate, themeMode) =>
  apiClient.put('/tenant/theme', { themeTemplate, themeMode }, { auth: true })

// entries: { [key]: value }. An empty value reverts that key to the default.
export const updateContent = (entries) => apiClient.put('/tenant/content', { entries }, { auth: true })

export const createSection = (kind, data, isVisible = true) =>
  apiClient.post('/tenant/sections', { kind, data, isVisible }, { auth: true })

export const updateSection = (id, { kind, data, isVisible }) =>
  apiClient.put(`/tenant/sections/${id}`, { kind, data, isVisible }, { auth: true })

export const deleteSection = (id) => apiClient.delete(`/tenant/sections/${id}`, { auth: true })

export const reorderSections = (orderedIds) =>
  apiClient.put('/tenant/sections/order', { orderedIds }, { auth: true })

// ---- Shop-admin: payments (currency + the shop's own Xendit account) -----
export const getPaymentSettings = () => apiClient.get('/tenant/payments', { auth: true })

// body: { currencyCode, xenditSecretKey?, xenditWebhookToken? }
//   omit a key field to leave it unchanged; send "-" to disconnect it.
export const updatePaymentSettings = (body) =>
  apiClient.put('/tenant/payments', body, { auth: true })

// body: { lowStockThreshold }
export const updateInventorySettings = (lowStockThreshold) =>
  apiClient.put('/tenant/inventory', { lowStockThreshold }, { auth: true })

// Uploads one image/video for use in a storefront block. Returns { url }.
// 503 when the server has no blob storage configured - callers fall back to
// letting the admin paste a hosted URL.
export const uploadTenantMedia = (file) => {
  const formData = new FormData()
  formData.append('files', file)
  return apiClient.postForm('/tenant/media', formData, { auth: true })
}
