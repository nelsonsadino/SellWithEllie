import { apiClient } from './client'

export const getChatMessages = (auctionId) => apiClient.get(`/auctions/${auctionId}/chat`)

export const sendChatMessage = (auctionId, content) =>
  apiClient.post(`/auctions/${auctionId}/chat`, { content }, { auth: true })

export const getRaffleChatMessages = (raffleId) => apiClient.get(`/raffles/${raffleId}/chat`)

export const sendRaffleChatMessage = (raffleId, content) =>
  apiClient.post(`/raffles/${raffleId}/chat`, { content }, { auth: true })

export const getBlockedChatUsers = () => apiClient.get('/chat/blocked-users', { auth: true })

// Block by real user id (admin loaded history) or by the opaque per-entity
// authorRef + auctionId/raffleId (blocking straight off a live message).
export const blockChatUser = ({ userId, authorRef, auctionId, raffleId, reason }) =>
  apiClient.post('/chat/block', { userId, authorRef, auctionId, raffleId, reason }, { auth: true })

export const unblockChatUser = (userId) => apiClient.delete(`/chat/block/${userId}`, { auth: true })
