import { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE_URL, api } from '../../../Services/API/api.js'

const EMPTY_PROFILE = {
  full_name: '',
  username: '',
  email: '',
  phone: '',
  address_line: '',
  city: '',
  province: '',
  postal_code: '',
  country: '',
  driver_license_number: '',
  driver_license_expiry: '',
  has_verification_photo: false,
}

function localDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export default function UserProfile({ user, onProfileSaved }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [photoConsent, setPhotoConsent] = useState(false)
  const [photoRefresh, setPhotoRefresh] = useState(0)
  const previewObjectUrl = useRef('')
  const minimumExpiryDate = useMemo(() => localDate(), [])

  useEffect(() => {
    let active = true
    api.get('/api/profile')
      .then((response) => {
        if (active) setProfile({ ...EMPTY_PROFILE, ...response.data })
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    let objectUrl = ''
    if (photoFile || !profile.has_verification_photo) return undefined

    fetch(`${API_BASE_URL}/api/profile/verification-photo`, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error('The saved verification photo could not be loaded.')
        return response.blob()
      })
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob)
          previewObjectUrl.current = objectUrl
          setPhotoPreview(objectUrl)
          setPhotoError('')
        }
      })
      .catch((requestError) => {
        if (active) setPhotoError(requestError.message)
      })
    return () => {
      active = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
        if (previewObjectUrl.current === objectUrl) previewObjectUrl.current = ''
      }
    }
  }, [photoFile, photoRefresh, profile.has_verification_photo])

  useEffect(() => () => {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current)
  }, [])

  function updateField(event) {
    const { name, value } = event.target
    setProfile((current) => ({ ...current, [name]: value }))
    setError('')
    setNotice('')
  }

  function selectPhoto(event) {
    const file = event.target.files?.[0] || null
    setPhotoFile(file)
    setPhotoError('')
    setError('')
    setNotice('')
    if (file && file.size > 5 * 1024 * 1024) {
      setPhotoFile(null)
      setPhotoError('Choose an image no larger than 5 MB.')
      event.target.value = ''
      return
    }
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoFile(null)
      setPhotoError('Upload a JPEG, PNG, or WebP image.')
      event.target.value = ''
      return
    }
    if (file) {
      if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current)
      const objectUrl = URL.createObjectURL(file)
      previewObjectUrl.current = objectUrl
      setPhotoPreview(objectUrl)
    }
  }

  async function saveProfile(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const form = new FormData()
    for (const field of [
      'full_name',
      'phone',
      'address_line',
      'city',
      'province',
      'postal_code',
      'country',
      'driver_license_number',
      'driver_license_expiry',
    ]) {
      form.append(field, profile[field].trim())
    }
    form.append('verification_consent', photoConsent ? 'yes' : 'no')
    if (photoFile) form.append('verification_photo', photoFile)

    try {
      const response = await api.post('/api/profile', form)
      if (response?.success !== true) throw new Error('The API did not confirm the profile update.')
      setProfile({ ...EMPTY_PROFILE, ...response.data })
      setPhotoFile(null)
      setPhotoConsent(false)
      setPhotoRefresh((current) => current + 1)
      onProfileSaved?.({
        ...user,
        full_name: response.data.full_name,
        email: response.data.email,
      })
      setNotice('Your profile has been saved.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const initial = (profile.full_name || profile.username || user?.full_name || user?.username || 'U')
    .trim()
    .slice(0, 1)
    .toUpperCase()

  return (
    <div className="public-page content-width customer-profile-page">
      <header className="customer-profile-hero">
        <span className="eyebrow">YOUR ACCOUNT</span>
        <h1>Your profile</h1>
        <p>Keep your contact details current and complete the driver verification information for your rentals.</p>
        <div className="customer-profile-progress">
          <span className={`customer-profile-progress-dot${profile.has_verification_photo ? ' complete' : ''}`} />
          <span>{profile.has_verification_photo ? 'Verification photo uploaded' : 'Profile completion required'}</span>
        </div>
      </header>

      {error && <div className="global-error customer-profile-message" role="alert">{error}</div>}
      {notice && <div className="success-message customer-profile-message" role="status">{notice}</div>}
      {loading ? (
        <div className="customer-profile-loading"><span className="spinner" />Loading your profile…</div>
      ) : (
        <form className="customer-profile-form" onSubmit={saveProfile}>
          <section className="customer-profile-panel">
            <div className="customer-profile-panel-heading">
              <span>01</span>
              <div><h2>Personal information</h2><p>Your account details and the best way to reach you.</p></div>
            </div>
            <div className="customer-profile-account">
              <div className="profile-details-avatar">{initial}</div>
              <div><b>{profile.full_name || user?.full_name || 'Your name'}</b><span>Customer account · @{profile.username || user?.username || 'customer'}</span></div>
            </div>
            <div className="customer-profile-fields">
              <label className="form-field">
                <span>Full legal name <i>*</i></span>
                <input name="full_name" autoComplete="name" maxLength="150" value={profile.full_name} onChange={updateField} required />
              </label>
              <label className="form-field">
                <span>Email address</span>
                <input value={profile.email || user?.email || ''} readOnly aria-readonly="true" />
                <small>Contact support if you need to change your account email.</small>
              </label>
              <label className="form-field">
                <span>Phone number <i>*</i></span>
                <input name="phone" type="tel" autoComplete="tel" maxLength="30" value={profile.phone} onChange={updateField} placeholder="+63 9XX XXX XXXX" required />
              </label>
            </div>
          </section>

          <section className="customer-profile-panel">
            <div className="customer-profile-panel-heading">
              <span>02</span>
              <div><h2>Home address</h2><p>Enter the residential address associated with your account.</p></div>
            </div>
            <div className="customer-profile-fields">
              <label className="form-field customer-profile-field-wide">
                <span>Street address, building, unit <i>*</i></span>
                <input name="address_line" autoComplete="street-address" maxLength="255" value={profile.address_line} onChange={updateField} required />
              </label>
              <label className="form-field">
                <span>City or municipality <i>*</i></span>
                <input name="city" autoComplete="address-level2" maxLength="100" value={profile.city} onChange={updateField} required />
              </label>
              <label className="form-field">
                <span>Province or region <i>*</i></span>
                <input name="province" autoComplete="address-level1" maxLength="100" value={profile.province} onChange={updateField} required />
              </label>
              <label className="form-field">
                <span>Postal code <i>*</i></span>
                <input name="postal_code" autoComplete="postal-code" maxLength="20" value={profile.postal_code} onChange={updateField} required />
              </label>
              <label className="form-field">
                <span>Country <i>*</i></span>
                <input name="country" autoComplete="country-name" maxLength="100" value={profile.country} onChange={updateField} required />
              </label>
            </div>
          </section>

          <section className="customer-profile-panel">
            <div className="customer-profile-panel-heading">
              <span>03</span>
              <div><h2>Driver’s licence</h2><p>Enter the licence details that match your photo identification.</p></div>
            </div>
            <div className="customer-profile-fields">
              <label className="form-field">
                <span>Licence number <i>*</i></span>
                <input name="driver_license_number" autoComplete="off" maxLength="100" value={profile.driver_license_number} onChange={updateField} required />
              </label>
              <label className="form-field">
                <span>Expiry date <i>*</i></span>
                <input name="driver_license_expiry" type="date" min={minimumExpiryDate} autoComplete="off" value={profile.driver_license_expiry} onChange={updateField} required />
              </label>
            </div>
            <div className="customer-profile-privacy-note">
              <span aria-hidden="true">i</span>
              <p>Your licence details and verification image are private and are only available to your authenticated account.</p>
            </div>
          </section>

          <section className="customer-profile-panel">
            <div className="customer-profile-panel-heading">
              <span>04</span>
              <div><h2>Photo verification</h2><p>Upload a clear photo of yourself holding your driver’s licence.</p></div>
            </div>
            <div className="customer-profile-photo-layout">
              <div className="customer-profile-photo-preview">
                {photoPreview
                  ? <img src={photoPreview} alt="Your driver verification photo" />
                  : <div><span aria-hidden="true">+</span><small>Your verification photo will appear here</small></div>}
              </div>
              <div className="customer-profile-photo-help">
                <label className="customer-profile-upload">
                  <span>{profile.has_verification_photo ? 'Replace photo' : 'Choose photo'} <i>*</i></span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={selectPhoto} required={!profile.has_verification_photo && !photoFile} />
                </label>
                <p>Use a well-lit, recent photo where your face and the licence details are clear. Accepted: JPEG, PNG, or WebP, up to 5 MB.</p>
                {profile.has_verification_photo && !photoFile && <span className="customer-profile-photo-saved">A verification photo is saved. Choose another to replace it.</span>}
                {photoError && <span className="customer-profile-photo-error" role="alert">{photoError}</span>}
              </div>
            </div>
            <label className="customer-profile-consent">
              <input type="checkbox" checked={photoConsent} onChange={(event) => setPhotoConsent(event.target.checked)} required />
              <span>I confirm that the uploaded image shows me holding my driver’s licence, and I consent to DriveRent using it for rental verification. <i>*</i></span>
            </label>
          </section>

          <div className="customer-profile-submit-row">
            <span><i>*</i> Required to complete your profile</span>
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? 'Saving profile…' : 'Save profile'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
