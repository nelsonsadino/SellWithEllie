import { apiClient } from './client'

export const getRaffles = (status) => apiClient.get(`/raffles${status ? `?status=${status}` : ''}`)
export const getRaffle = (id) => apiClient.get(`/raffles/${id}`)
export const createRaffle = (payload) => apiClient.post('/raffles', payload, { auth: true })
export const reserveSeats = (id, payload) => apiClient.post(`/raffles/${id}/reserve`, payload, { auth: true })
export const markSeatPaid = (id, seatId) => apiClient.post(`/raffles/${id}/seats/${seatId}/mark-paid`, undefined, { auth: true })
export const releaseSeat = (id, seatId) => apiClient.post(`/raffles/${id}/seats/${seatId}/release`, undefined, { auth: true })
export const forceCloseRaffle = (id) => apiClient.post(`/raffles/${id}/force-close`, undefined, { auth: true })
export const drawRaffleWinner = (id) => apiClient.post(`/raffles/${id}/draw`, undefined, { auth: true })
export const revealNextRafflePrize = (id) => apiClient.post(`/raffles/${id}/draw/reveal-next`, undefined, { auth: true })
export const cancelRaffle = (id) => apiClient.post(`/raffles/${id}/cancel`, undefined, { auth: true })
export const reopenRaffle = (id) => apiClient.post(`/raffles/${id}/reopen`, undefined, { auth: true })
export const cancelMyReservation = (id, orderId) =>
  apiClient.post(`/raffles/${id}/reservations/${orderId}/cancel`, undefined, { auth: true })
