import { api } from './api.js'

export async function getVehicleRecommendations() { const response = await api.get('/api/ai/recommendations'); return response?.data || []; }
export async function getAIStatus() { try { const response = await api.get('/api/ai/status'); return response?.data || { status: 'offline' }; } catch (error) { return { status: 'offline', message: error.message }; } }

export async function sendChatMessage(payload) {
  const response = await api.post('/api/chat', payload)
  const result = response?.data
  if (typeof result?.message !== 'string' || !result.message.trim()) {
    throw new Error('The chat service returned an empty response.')
  }
  return result
}
