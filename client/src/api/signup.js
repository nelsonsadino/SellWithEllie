import { apiClient } from './client'

// Neither call carries an X-Tenant-Slug header (there is no tenant yet) -
// they hit the platform-level SignupController, not a per-shop endpoint.
export const checkSlugAvailability = (slug) =>
  apiClient.get(`/signup/check-slug?slug=${encodeURIComponent(slug)}`)

export const signupShop = (payload) => apiClient.post('/signup', payload)
