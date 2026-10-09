import { apiClient } from './client'

// Public: the platform's own marketing site content + blocks.
export const getMarketingSite = () => apiClient.get('/marketing/site')

// ---- Platform-admin: editing the marketing site -------------------------
export const getMarketingAdmin = () => apiClient.get('/platform/marketing', { auth: true })

export const updateMarketingContent = (entries) =>
  apiClient.put('/platform/marketing/content', { entries }, { auth: true })

export const createMarketingSection = (kind, data, isVisible = true) =>
  apiClient.post('/platform/marketing/sections', { kind, data, isVisible }, { auth: true })

export const updateMarketingSection = (id, { kind, data, isVisible }) =>
  apiClient.put(`/platform/marketing/sections/${id}`, { kind, data, isVisible }, { auth: true })

export const deleteMarketingSection = (id) =>
  apiClient.delete(`/platform/marketing/sections/${id}`, { auth: true })

export const reorderMarketingSections = (orderedIds) =>
  apiClient.put('/platform/marketing/sections/order', { orderedIds }, { auth: true })
