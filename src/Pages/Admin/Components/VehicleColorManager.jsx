import { useEffect, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'
import './VehicleColorManager.css'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function ColorRow({ variant, busy, onSave, onRemove, onUpload }) {
  const [color, setColor] = useState(variant.color)
  const [stock, setStock] = useState(String(variant.stock))

  const saveColor = () => {
    const name = color.trim()
    if (!name) {
      setColor(variant.color)
    } else if (name !== variant.color) {
      onSave(variant, { color: name }, () => setColor(variant.color))
    }
  }

  const saveStock = () => {
    if (stock.trim() === '') {
      setStock(String(variant.stock))
    } else if (Number(stock) !== Number(variant.stock)) {
      onSave(variant, { stock }, () => setStock(String(variant.stock)))
    }
  }

  const saveOnEnter = (event, save) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      save()
    }
  }

  return (
    <li className="vcm-row">
      <label className="vcm-field vcm-field-color">
        <span>Colour</span>
        <input value={color} maxLength="50" onChange={(event) => setColor(event.target.value)} onBlur={saveColor} onKeyDown={(event) => saveOnEnter(event, saveColor)} />
      </label>
      <label className="vcm-field vcm-field-stock">
        <span>Stock</span>
        <input type="number" min="0" max="9999" step="1" value={stock} onChange={(event) => setStock(event.target.value)} onBlur={saveStock} onKeyDown={(event) => saveOnEnter(event, saveStock)} />
      </label>
      <label className={`vcm-upload${busy ? ' is-busy' : ''}`}>
        Add photos
        <input type="file" accept={IMAGE_TYPES.join(',')} multiple disabled={busy} onChange={(event) => { onUpload(variant, event.target.files); event.target.value = '' }} />
      </label>
      <button className="vcm-remove" type="button" disabled={busy} onClick={() => onRemove(variant)}>Remove</button>
    </li>
  )
}

export default function VehicleColorManager({ carId, images, onImagesChange }) {
  const [variants, setVariants] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newColor, setNewColor] = useState('')
  const [newStock, setNewStock] = useState('1')

  useEffect(() => {
    let active = true
    api.get(`/api/cars/${carId}`)
      .then((response) => { if (active) setVariants(response?.data?.variants || []) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [carId])

  const run = async (action, onFailure) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (requestError) {
      setError(requestError.message)
      onFailure?.()
    } finally {
      setBusy(false)
    }
  }

  const applyCar = (response) => {
    if (response?.data?.variants) setVariants(response.data.variants)
    if (response?.data?.images) onImagesChange(response.data.images)
  }

  const addColor = () => {
    const color = newColor.trim()
    if (!color) {
      setError('Enter a colour name.')
      return
    }
    run(async () => {
      applyCar(await api.post(`/api/cars/${carId}/variants`, { color, stock: newStock }))
      setNewColor('')
      setNewStock('1')
    })
  }

  const saveVariant = (variant, values, onFailure) => {
    run(async () => applyCar(await api.patch(`/api/cars/${carId}/variants/${variant.id}`, values)), onFailure)
  }

  const removeVariant = (variant) => {
    run(async () => applyCar(await api.delete(`/api/cars/${carId}/variants/${variant.id}`)))
  }

  const uploadPhotos = (variant, fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    if (files.some((file) => !IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES)) {
      setError('Photos must be JPEG, PNG, or WebP files no larger than 5 MB each.')
      return
    }
    run(async () => {
      const formData = new FormData()
      formData.append('variant_id', variant.id)
      files.forEach((file) => formData.append('images[]', file))
      const response = await api.post(`/api/cars/${carId}/images`, formData)
      onImagesChange((current) => [...current, ...(response?.data || [])])
    })
  }

  const linkPhoto = (image, value) => {
    run(async () => applyCar(await api.patch(`/api/cars/${carId}/images/${image.id}`, { variant_id: value || null })))
  }

  return (
    <section className="form-panel vcm" aria-busy={loading || busy}>
      <div className="form-section-heading">
        <span>05</span>
        <div>
          <h2>Colours and stock</h2>
          <p>Stock is how many units of each colour can be out at once. With no colours, this vehicle counts as one unit. Changes here save right away.</p>
        </div>
      </div>

      {error && <div className="vcm-error" role="alert">{error}</div>}

      {loading ? <p className="vcm-note">Loading colours…</p> : (
        <>
          {variants.length > 0 && (
            <ul className="vcm-rows">
              {variants.map((variant) => (
                <ColorRow key={variant.id} variant={variant} busy={busy} onSave={saveVariant} onRemove={removeVariant} onUpload={uploadPhotos} />
              ))}
            </ul>
          )}

          <div className="vcm-add">
            <label className="vcm-field vcm-field-color">
              <span>New colour</span>
              <input
                value={newColor}
                maxLength="50"
                placeholder="White"
                onChange={(event) => setNewColor(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addColor() } }}
              />
            </label>
            <label className="vcm-field vcm-field-stock">
              <span>Stock</span>
              <input type="number" min="0" max="9999" step="1" value={newStock} onChange={(event) => setNewStock(event.target.value)} />
            </label>
            <button className="vcm-add-button" type="button" disabled={busy} onClick={addColor}>Add colour</button>
          </div>

          {variants.length > 0 && images.length > 0 && (
            <div className="vcm-photos">
              <h3>Photo colours</h3>
              <p className="vcm-note">“All colours” photos appear under every colour, such as the interior.</p>
              <ul>
                {images.map((image) => (
                  <li key={image.id}>
                    <img src={imageUrl(image.image_path)} alt="" />
                    <select aria-label={`Colour for photo ${image.id}`} value={image.variant_id ?? ''} disabled={busy} onChange={(event) => linkPhoto(image, event.target.value)}>
                      <option value="">All colours</option>
                      {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.color}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}
