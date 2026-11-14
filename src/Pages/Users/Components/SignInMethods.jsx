import { useEffect, useState } from 'react'
import { api } from '../../../Services/API/api.js'
import GoogleSignInButton from '../../../auth/GoogleSignInButton.jsx'

/**
 * Lets the signed-in owner link or unlink Google. Linking never happens automatically by
 * matching an email address; it needs this explicit action while signed in.
 */
export default function SignInMethods() {
  const [account, setAccount] = useState(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    api.get('/api/me')
      .then((response) => { if (active) setAccount(response.data) })
      .catch((requestError) => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [])

  const link = async (credential) => {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const response = await api.post('/api/account/google/link', { credential })
      setAccount((current) => ({ ...current, google_linked: true }))
      setNotice(response.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const unlink = async (event) => {
    event.preventDefault()
    if (!window.confirm('Unlink Google? You will sign in with your email and password only.')) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const response = await api.post('/api/account/google/unlink', { password })
      setAccount((current) => ({ ...current, google_linked: false }))
      setPassword('')
      setNotice(response.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  if (!account) {
    return error ? <section className="pf-card pf-section"><p role="alert">{error}</p></section> : null
  }

  return (
    <section className="pf-card pf-section pf-signin" aria-labelledby="pf-signin-title">
      <div className="pf-section-head">
        <h2 id="pf-signin-title">Sign-in methods</h2>
        <p>Email and password{account.has_password ? '' : ' (not set yet: use "Forgot password" on the sign-in page to choose one)'}{account.google_linked ? ', and Google.' : '.'}</p>
      </div>
      {error && <p className="pf-save-message pf-save-error" role="alert">{error}</p>}
      {notice && <p className="pf-save-message pf-save-good" role="status">{notice}</p>}
      {account.google_linked ? (
        account.has_password ? (
          <form onSubmit={unlink} className="pf-signin-form">
            <label className="form-field"><span>Current password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <button type="submit" className="pf-btn" disabled={busy || !password}>{busy ? 'Unlinking…' : 'Unlink Google'}</button>
          </form>
        ) : <p>Set a password before you can unlink Google, so you can still sign in.</p>
      ) : (
        <div>
          <p>Link your Google account to sign in with it.</p>
          <GoogleSignInButton onCredential={link} onError={setError} />
        </div>
      )}
    </section>
  )
}
