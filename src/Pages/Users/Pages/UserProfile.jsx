import { useEffect, useMemo, useRef, useState } from 'react'
import { api, authorizedFetch } from '../../../Services/API/api.js'
import SignInMethods from '../Components/SignInMethods.jsx'
import './UserProfile.css'

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

const FIELD_LABELS = {
  full_name: 'your full legal name',
  phone: 'your phone number',
  address_line: 'your street address',
  city: 'your city or municipality',
  province: 'your province or region',
  postal_code: 'your postal code',
  country: 'your country',
  driver_license_number: 'your license number',
  driver_license_expiry: 'your license expiry date',
}

// Also the order the form is checked in, so the first problem found is the first one on the page.
const EDITABLE_FIELDS = Object.keys(FIELD_LABELS)

const SECTIONS = [
  { id: 'pf-personal', title: 'Personal information', fields: ['full_name', 'phone'] },
  { id: 'pf-address', title: 'Home address', fields: ['address_line', 'city', 'province', 'postal_code', 'country'] },
  { id: 'pf-license', title: "Driver's license", fields: ['driver_license_number', 'driver_license_expiry'] },
  { id: 'pf-photo', title: 'Photo verification', fields: [] },
]

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const EXPIRY_WARNING_DAYS = 30

function localDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function daysUntil(date, today) {
  return Math.round((new Date(`${date}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000)
}

/** Matches the backend's rules for each field, so most problems are caught before saving. */
function fieldError(name, rawValue, today) {
  const value = String(rawValue || '').trim()
  if (!value) return `Enter ${FIELD_LABELS[name]}.`
  if (name === 'phone' && !/^[0-9+\s()-]{7,30}$/.test(value)) return 'Enter a phone number using digits, spaces, and + ( ) - only.'
  if (name === 'driver_license_expiry' && value < today) return 'This license has expired. Enter the expiry date of a current license.'
  return ''
}

function ProfileSkeleton() {
  return (
    <div className="pf-layout" role="status" aria-label="Loading your profile">
      <div className="pf-card pf-summary" aria-hidden="true">
        <span className="pf-shimmer pf-line-avatar" />
        <span className="pf-shimmer pf-line-short" />
        <span className="pf-shimmer pf-line-block" />
      </div>
      <div className="pf-form" aria-hidden="true">
        <div className="pf-card pf-section">
          <span className="pf-shimmer pf-line-short" />
          <span className="pf-shimmer pf-line-block" />
          <span className="pf-shimmer pf-line-block" />
        </div>
      </div>
    </div>
  )
}

function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.500 4.500 4.500L19 7.500" /></svg>
}

function SaveMessage({ error, notice }) {
  if (error) return <p className="pf-save-message pf-save-error" role="alert">{error}</p>
  if (notice) return <p className="pf-save-message pf-save-good" role="status">{notice}</p>
  return null
}

export default function UserProfile({ user, onProfileSaved }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE)
  const [saved, setSaved] = useState(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [photoConsent, setPhotoConsent] = useState(false)
  const [photoRefresh, setPhotoRefresh] = useState(0)
  const previewObjectUrl = useRef('')
  const photoInput = useRef(null)
  const formRef = useRef(null)
  const today = useMemo(() => localDate(), [])

  useEffect(() => {
    let active = true
    api.get('/api/profile')
      .then((response) => {
        if (!active) return
        const loaded = { ...EMPTY_PROFILE, ...response.data }
        setProfile(loaded)
        setSaved(loaded)
      })
      .catch((requestError) => {
        if (active) setLoadError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [attempt])

  useEffect(() => {
    let active = true
    let objectUrl = ''
    if (photoFile || !profile.has_verification_photo) return undefined

    authorizedFetch('/api/profile/verification-photo')
      .then((response) => {
        if (!response.ok) throw new Error('Your saved photo could not be shown. It is still on your account.')
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

  function clearMessages() {
    setError('')
    setNotice('')
  }

  function clearFieldError(name) {
    setFieldErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  function updateField(event) {
    const { name, value } = event.target
    setProfile((current) => ({ ...current, [name]: value }))
    clearFieldError(name)
    clearMessages()
  }

  function showPhoto(url) {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current)
    previewObjectUrl.current = url
    setPhotoPreview(url)
  }

  function selectPhoto(event) {
    const file = event.target.files?.[0]
    // Closing the file picker without choosing keeps whatever photo is already there.
    if (!file) return
    clearMessages()
    let problem = ''
    if (file.size > MAX_PHOTO_BYTES) problem = 'Choose an image no larger than 5 MB.'
    else if (!PHOTO_TYPES.includes(file.type)) problem = 'Upload a JPEG, PNG, or WebP image.'
    if (problem) {
      setPhotoError(problem)
      event.target.value = ''
      return
    }
    setPhotoError('')
    clearFieldError('photo')
    setPhotoFile(file)
    showPhoto(URL.createObjectURL(file))
  }

  function discardNewPhoto() {
    setPhotoFile(null)
    setPhotoError('')
    showPhoto('')
    if (photoInput.current) photoInput.current.value = ''
  }

  function validate() {
    const errors = {}
    for (const name of EDITABLE_FIELDS) {
      const problem = fieldError(name, profile[name], today)
      if (problem) errors[name] = problem
    }
    if (!photoFile && !profile.has_verification_photo) errors.photo = 'Add a photo of yourself holding your driver\'s license.'
    if (!photoConsent) errors.consent = 'Confirm this statement to save your profile.'
    return errors
  }

  async function saveProfile(event) {
    event.preventDefault()
    clearMessages()

    const errors = validate()
    setFieldErrors(errors)
    const firstProblem = [...EDITABLE_FIELDS, 'photo', 'consent'].find((name) => errors[name])
    if (firstProblem) {
      const target = formRef.current?.elements[firstProblem]
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'center' })
      setError(`${Object.keys(errors).length === 1 ? '1 item needs' : `${Object.keys(errors).length} items need`} your attention before you can save.`)
      return
    }

    setSaving(true)
    const form = new FormData()
    for (const field of EDITABLE_FIELDS) form.append(field, profile[field].trim())
    form.append('verification_consent', 'yes')
    if (photoFile) form.append('verification_photo', photoFile)

    try {
      const response = await api.post('/api/profile', form)
      if (response?.success !== true) throw new Error('The API did not confirm the profile update.')
      const updated = { ...EMPTY_PROFILE, ...response.data }
      setProfile(updated)
      setSaved(updated)
      setPhotoFile(null)
      setPhotoConsent(false)
      setPhotoRefresh((current) => current + 1)
      if (photoInput.current) photoInput.current.value = ''
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

  function fieldProps(name) {
    const problem = fieldErrors[name]
    return {
      name,
      value: profile[name],
      onChange: updateField,
      'aria-invalid': problem ? 'true' : undefined,
      'aria-describedby': problem ? `pf-error-${name}` : undefined,
    }
  }

  const renderFieldError = (name) => fieldErrors[name] && <small className="pf-error" id={`pf-error-${name}`}>{fieldErrors[name]}</small>

  const isDirty = Boolean(photoFile) || EDITABLE_FIELDS.some((name) => profile[name] !== saved[name])
  const hasPhoto = Boolean(photoFile) || profile.has_verification_photo
  const sectionDone = (section) => (section.id === 'pf-photo'
    ? hasPhoto
    : section.fields.every((name) => !fieldError(name, profile[name], today)))
  const completeCount = SECTIONS.filter(sectionDone).length
  const isComplete = completeCount === SECTIONS.length

  const expiry = profile.driver_license_expiry
  const expiryDays = expiry && !fieldErrors.driver_license_expiry ? daysUntil(expiry, today) : null
  const displayName = profile.full_name || user?.full_name || 'Your name'
  const initial = (profile.full_name || profile.username || user?.full_name || user?.username || 'U')
    .trim()
    .slice(0, 1)
    .toUpperCase()

  function retry() {
    setLoadError('')
    setLoading(true)
    setAttempt((value) => value + 1)
  }

  const saveLabel = saving ? 'Saving…' : 'Save profile'

  return (
    <div className="public-page content-width pf">
      <header className="pf-header">
        <span className="pf-eyebrow">Your account</span>
        <h1>Your profile</h1>
        <p>Keep your contact details and driver's license current for your rentals. All fields are required.</p>
      </header>

      {loading ? <ProfileSkeleton /> : loadError ? (
        <div className="pf-card pf-state" role="alert">
          <h2>We couldn't load your profile</h2>
          <p>{loadError}</p>
          <button type="button" className="pf-btn pf-btn-primary" onClick={retry}>Try again</button>
        </div>
      ) : (
        <div className="pf-layout">
          <aside className="pf-card pf-summary" aria-label="Profile summary">
            <div className="pf-identity">
              <span className="pf-avatar" aria-hidden="true">{initial}</span>
              <div>
                <b>{displayName}</b>
                <span>@{profile.username || user?.username || 'customer'}</span>
              </div>
            </div>

            <p className="pf-progress">{isComplete ? 'All sections complete' : `${completeCount} of ${SECTIONS.length} sections complete`}</p>
            <ul className="pf-checklist">
              {SECTIONS.map((section) => {
                const done = sectionDone(section)
                return (
                  <li key={section.id}>
                    <button type="button" onClick={() => document.getElementById(section.id)?.scrollIntoView({ block: 'start' })}>
                      <span className={`pf-tick${done ? ' is-done' : ''}`}>{done && <CheckIcon />}</span>
                      {section.title}
                      <span className="pf-sr">{done ? ' (complete)' : ' (incomplete)'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="pf-aside-save">
              <button type="submit" form="pf-form" className="pf-btn pf-btn-primary" disabled={saving}>{saveLabel}</button>
              {isDirty && !error && <p className="pf-dirty">You have unsaved changes.</p>}
              <SaveMessage error={error} notice={notice} />
            </div>
          </aside>

          <form id="pf-form" className="pf-form" ref={formRef} onSubmit={saveProfile} noValidate>
            <section className="pf-card pf-section" id="pf-personal">
              <div className="pf-section-head">
                <h2>Personal information</h2>
                <p>Your account details and the best way to reach you.</p>
              </div>
              <div className="pf-fields">
                <label className="pf-field pf-wide">
                  <span>Full legal name</span>
                  <input {...fieldProps('full_name')} autoComplete="name" maxLength="150" />
                  {renderFieldError('full_name')}
                </label>
                <label className="pf-field">
                  <span>Phone number</span>
                  <input {...fieldProps('phone')} type="tel" autoComplete="tel" maxLength="30" placeholder="+63 9XX XXX XXXX" />
                  {renderFieldError('phone')}
                </label>
                <label className="pf-field">
                  <span>Email address</span>
                  <input value={profile.email || user?.email || ''} readOnly />
                  <small>Contact support to change your account email.</small>
                </label>
              </div>
            </section>

            <section className="pf-card pf-section" id="pf-address">
              <div className="pf-section-head">
                <h2>Home address</h2>
                <p>The residential address on your account.</p>
              </div>
              <div className="pf-fields">
                <label className="pf-field pf-wide">
                  <span>Street address, building, unit</span>
                  <input {...fieldProps('address_line')} autoComplete="street-address" maxLength="255" />
                  {renderFieldError('address_line')}
                </label>
                <label className="pf-field">
                  <span>City or municipality</span>
                  <input {...fieldProps('city')} autoComplete="address-level2" maxLength="100" />
                  {renderFieldError('city')}
                </label>
                <label className="pf-field">
                  <span>Province or region</span>
                  <input {...fieldProps('province')} autoComplete="address-level1" maxLength="100" />
                  {renderFieldError('province')}
                </label>
                <label className="pf-field">
                  <span>Postal code</span>
                  <input {...fieldProps('postal_code')} autoComplete="postal-code" maxLength="20" />
                  {renderFieldError('postal_code')}
                </label>
                <label className="pf-field">
                  <span>Country</span>
                  <input {...fieldProps('country')} autoComplete="country-name" maxLength="100" />
                  {renderFieldError('country')}
                </label>
              </div>
            </section>

            <section className="pf-card pf-section" id="pf-license">
              <div className="pf-section-head">
                <h2>Driver's license</h2>
                <p>Enter the details exactly as they appear on your license.</p>
              </div>
              <div className="pf-fields">
                <label className="pf-field">
                  <span>License number</span>
                  <input {...fieldProps('driver_license_number')} autoComplete="off" maxLength="100" />
                  {renderFieldError('driver_license_number')}
                </label>
                <label className="pf-field">
                  <span>Expiry date</span>
                  <input {...fieldProps('driver_license_expiry')} type="date" min={today} autoComplete="off" />
                  {renderFieldError('driver_license_expiry')}
                  {expiryDays !== null && expiryDays < 0 && !fieldErrors.driver_license_expiry && <small className="pf-warning">This date has passed. Enter the expiry date of a current license.</small>}
                  {expiryDays !== null && expiryDays >= 0 && expiryDays <= EXPIRY_WARNING_DAYS && <small className="pf-warning">Your license expires {expiryDays === 0 ? 'today' : `in ${expiryDays} ${expiryDays === 1 ? 'day' : 'days'}`}. Renew it before your rental.</small>}
                </label>
              </div>
              <p className="pf-note">Your license details and verification photo are private to your account.</p>
            </section>

            <section className="pf-card pf-section" id="pf-photo">
              <div className="pf-section-head">
                <h2>Photo verification</h2>
                <p>A clear photo of yourself holding your driver's license.</p>
              </div>
              <div className="pf-photo">
                <div className="pf-photo-frame">
                  {photoPreview
                    ? <img src={photoPreview} alt={photoFile ? 'Your new verification photo, not saved yet' : 'Your saved verification photo'} />
                    : <span>No photo yet</span>}
                </div>
                <div className="pf-photo-help">
                  <ul>
                    <li>Your face and the license details are both clear</li>
                    <li>Recent and well lit</li>
                    <li>JPEG, PNG, or WebP, up to 5 MB</li>
                  </ul>
                  <div className="pf-photo-actions">
                    <label className="pf-btn pf-btn-outline pf-upload">
                      {hasPhoto ? 'Choose a different photo' : 'Choose photo'}
                      <input
                        ref={photoInput}
                        name="photo"
                        type="file"
                        accept={PHOTO_TYPES.join(',')}
                        aria-invalid={fieldErrors.photo ? 'true' : undefined}
                        aria-describedby={fieldErrors.photo ? 'pf-error-photo' : undefined}
                        onChange={selectPhoto}
                      />
                    </label>
                    {photoFile && <button type="button" className="pf-btn-link" onClick={discardNewPhoto}>{profile.has_verification_photo ? 'Keep saved photo' : 'Remove'}</button>}
                  </div>
                  {photoFile && <small className="pf-file-name">{photoFile.name} will be used when you save.</small>}
                  {!photoFile && profile.has_verification_photo && !photoError && <small className="pf-saved">Photo saved on your account.</small>}
                  {renderFieldError('photo')}
                  {photoError && <small className="pf-error" role="alert">{photoError}</small>}
                </div>
              </div>
              <div className="pf-consent-wrap">
                <label className={`pf-consent${fieldErrors.consent ? ' has-error' : ''}`}>
                  <input
                    name="consent"
                    type="checkbox"
                    checked={photoConsent}
                    aria-invalid={fieldErrors.consent ? 'true' : undefined}
                    aria-describedby={fieldErrors.consent ? 'pf-error-consent' : undefined}
                    onChange={(event) => {
                      setPhotoConsent(event.target.checked)
                      clearFieldError('consent')
                      clearMessages()
                    }}
                  />
                  <span>I confirm that the uploaded image shows me holding my driver's license, and I consent to DriveRent using it for rental verification.</span>
                </label>
                {renderFieldError('consent')}
                <small>We ask for this each time you save.</small>
              </div>
            </section>

            <div className="pf-form-save">
              <SaveMessage error={error} notice={notice} />
              {isDirty && !error && <p className="pf-dirty">You have unsaved changes.</p>}
              <button type="submit" className="pf-btn pf-btn-primary" disabled={saving}>{saveLabel}</button>
            </div>
          </form>
        </div>
      )}
      {!loading && !loadError && <SignInMethods />}
    </div>
  )
}
