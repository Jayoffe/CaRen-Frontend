import { api } from './api.js'

export async function getPayments() { const response = await api.get('/api/payments'); return response?.data || []; }
