import { api } from './api.js'

export async function getMaintenanceRecords() { const response = await api.get('/api/maintenance'); return response?.data || []; }
