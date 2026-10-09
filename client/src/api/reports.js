import { apiClient } from './client'

export const getReportSummary = (days = 30) => apiClient.get(`/reports/summary?days=${days}`, { auth: true })
