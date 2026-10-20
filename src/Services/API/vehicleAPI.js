import { api } from './api.js'

export async function getVehicles() { const response = await api.get('/api/cars/available'); return response?.data || []; }
export async function getVehicleById(id) { const response = await api.get(`/api/cars/${id}`); return response?.data || null; }
