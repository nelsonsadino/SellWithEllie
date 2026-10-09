import { apiClient } from './client'

export const getAuditLog = (page = 1, pageSize = 25) =>
  apiClient.get(`/audit-log?page=${page}&pageSize=${pageSize}`, { auth: true })
