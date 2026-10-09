import { apiClient } from './client'

export const getAuctions = (status) => apiClient.get(`/auctions${status ? `?status=${status}` : ''}`)
export const getAuction = (id) => apiClient.get(`/auctions/${id}`)
export const createAuction = (payload) => apiClient.post('/auctions', payload, { auth: true })
export const cancelAuction = (id) => apiClient.post(`/auctions/${id}/cancel`, undefined, { auth: true })
export const placeBid = (id, amount) => apiClient.post(`/auctions/${id}/bids`, { amount }, { auth: true })
export const buyoutAuction = (id, payload) => apiClient.post(`/auctions/${id}/buyout`, payload, { auth: true })
