import { apiClient } from './client'

export const getPlatformTenants = () => apiClient.get('/platform/tenants', { auth: true })

export const createShop = (payload) => apiClient.post('/platform/tenants', payload, { auth: true })

export const activateTenant = (id) => apiClient.post(`/platform/tenants/${id}/activate`, undefined, { auth: true })

export const deactivateTenant = (id) => apiClient.post(`/platform/tenants/${id}/deactivate`, undefined, { auth: true })
