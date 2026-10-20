import { api } from './api.js'

export async function login(credentials) { return api.post('/api/login', credentials) }
export async function register(payload) { return api.post('/api/register', payload) }
export async function logout() { return api.post('/api/logout', {}) }
export async function getCurrentUser() { return api.get('/api/me') }
