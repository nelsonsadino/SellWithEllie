import { apiClient } from './client'

export const getBillingStatus = () => apiClient.get('/billing/status', { auth: true })

export const createCheckoutSession = (successUrl, cancelUrl) =>
  apiClient.post('/billing/create-checkout-session', { successUrl, cancelUrl }, { auth: true })
