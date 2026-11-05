const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export function parseFeatures(features) {
  if (Array.isArray(features)) return features
  if (!features) return []
  try {
    const parsed = JSON.parse(features)
    if (Array.isArray(parsed)) return parsed
  } catch {
    return String(features).split(',').map((feature) => feature.trim()).filter(Boolean)
  }
  return []
}

export function invalidImage(files) {
  const file = files.find((item) => !PHOTO_TYPES.includes(item.type) || item.size > MAX_PHOTO_BYTES)
  return file ? `${file.name} must be a JPEG, PNG, or WebP image no larger than 5 MB.` : ''
}
