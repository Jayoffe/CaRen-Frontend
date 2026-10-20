import { api } from './api.js'

export async function getCustomers() { const response = await api.get('/api/customers'); return response?.data || []; }
