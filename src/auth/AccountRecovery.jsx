import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

/** Shared layout for the email-link pages, matching the sign-in page. */
function AuthCard({ navigate, eyebrow, title, intro, children }) {
  return <div className="login-page">
    <section className="login-visual">
      <div className="login-brand"><button className="logo" onClick={() => navigate('/')} aria-label="DriveRent home"><span className="logo-symbol">D</span><span>Drive<span>Rent</span></span></button></div>
      <span className="eyebrow light">ACCOUNT SECURITY</span>
      <h1>Keep your<br /><em>account yours.</em></h1>
      <p>Links we email you work once and expire, so only you can use them.</p>
    </section>
    <div className="login-form">
      <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{intro && <p>{intro}</p>}</div>
      {children}
      <p className="auth-switch"><button type="button" onClick={() => navigate('/auth/login')}>Back to sign in</button></p>
    </div>
  </div>
}

function tokenFromUrl() {
  return new URLSearchParams(window.location.search).get('token') || ''
}

/** /auth/verify-email?token=…: confirms the address as soon as the page opens. */
export function VerifyEmail({ navigate }) {
  const [state, setState] = useState({ status: 'working', message: '' })
  const started = useRef(false)

  useEffect(() => {
    // React's development double-invoke must not spend the single-use token twice.
    if (started.current) return
    started.current = true
    api.post('/api/email/verify', { token: tokenFromUrl() })
      .then((response) => {
        window.sessionStorage.setItem('authSuccess', response.message)
        setState({ status: 'done', message: response.message })
      })
      .catch((error) => setState({ status: 'failed', message: error.message }))
  }, [])

  return <AuthCard navigate={navigate} eyebrow="EMAIL VERIFICATION" title="Verify your email">
    {state.status === 'working' && <p role="status"><span className="button-spinner" /> Verifying your email address…</p>}
    {state.status === 'done' && <>
      <div className="auth-success" role="status">{state.message}</div>
      <button type="button" className="button button-primary login-submit" onClick={() => navigate('/auth/login')}>Sign in</button>
    </>}
    {state.status === 'failed' && <div className="error-message" role="alert">{state.message}</div>}
  </AuthCard>
}

/** /auth/forgot-password: asks for a reset link. The reply never says whether the address exists. */
export function ForgotPassword({ navigate }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!email.includes('@')) {
      setError('Enter the email address of your account.')
      return
    }
    setLoading(true)
    try {
      const response = await api.post('/api/password/forgot', { email: email.trim() })
      setMessage(response.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return <AuthCard navigate={navigate} eyebrow="PASSWORD RESET" title="Forgot your password?" intro="Enter your email address and we will send you a link to choose a new password. It also works for accounts created with Google that never had a password.">
    <form onSubmit={submit} noValidate className="auth-stack">
      {message && <div className="auth-success" role="status">{message}</div>}
      {error && <div className="error-message" role="alert">{error}</div>}
      <label className="form-field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <button className="button button-primary login-submit" disabled={loading}>{loading ? <><span className="button-spinner" />Sending…</> : 'Send reset link'}</button>
    </form>
  </AuthCard>
}

/** /auth/reset-password?token=…: sets a new password and signs out every other session. */
export function ResetPassword({ navigate }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (password.length < 8 || password.length > 72) {
      setError('The password must be 8 to 72 characters long.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const response = await api.post('/api/password/reset', { token: tokenFromUrl(), password })
      window.sessionStorage.setItem('authSuccess', response.message)
      navigate('/auth/login', true)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return <AuthCard navigate={navigate} eyebrow="PASSWORD RESET" title="Choose a new password" intro="After you save it, you are signed out on every device.">
    <form onSubmit={submit} noValidate className="auth-stack">
      {error && <div className="error-message" role="alert">{error}</div>}
      <label className="form-field"><span>New password</span><div className="password-input"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="8" maxLength="72" required /><button type="button" onClick={() => setShowPassword((show) => !show)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
      <label className="form-field"><span>Confirm new password</span><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength="8" maxLength="72" required /></label>
      <button className="button button-primary login-submit" disabled={loading}>{loading ? <><span className="button-spinner" />Saving…</> : 'Save new password'}</button>
    </form>
  </AuthCard>
}
