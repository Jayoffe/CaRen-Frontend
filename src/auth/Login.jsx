import { useEffect, useState } from 'react'
import GoogleSignInButton from './GoogleSignInButton.jsx'
import './Login.css'

export default function Login({ onLogin, onGoogleLogin, navigate, onError, error }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState(() => window.sessionStorage.getItem('authSuccess') || '')
  const [attempted, setAttempted] = useState(false)
  const emailInvalid = attempted && !email.trim()
  const passwordInvalid = attempted && !password

  useEffect(() => {
    if (success) window.sessionStorage.removeItem('authSuccess')
  }, [success])

  const submit = async (event) => {
    event.preventDefault()
    setFormError('')
    setSuccess('')
    onError('')
    if (!email.trim() || !password) {
      setAttempted(true)
      setFormError('Email and password are required.')
      return
    }
    setLoading(true)
    try {
      await onLogin({ email: email.trim(), password })
    } catch (requestError) {
      setFormError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const googleCredential = async (credential) => {
    setFormError('')
    onError('')
    setLoading(true)
    try {
      await onGoogleLogin(credential)
    } catch (requestError) {
      setFormError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return <div className="login-page">
    <section className="login-visual">
      <div className="login-brand"><button className="logo" onClick={() => navigate('/')} aria-label="DriveRent home"><img className="logo-mark" src="/logo.png" alt="" width="64" height="36" decoding="async" /><span>Drive<span>Rent</span></span></button></div>
      <span className="eyebrow light">WELCOME TO DRIVERENT</span>
      <h1>Your next<br /><em>journey starts here.</em></h1>
      <p>Sign in to see the fleet and make the road your own.</p>
      <span className="login-side-note">GO FURTHER. FEEL CLOSER.</span>
    </section>
    <form className="login-form signin-form" onSubmit={submit} noValidate>
      <div className="signin-shell">
        <div className="signin-core">
          <header className="signin-head">
            <span className="signin-eyebrow">Your account</span>
            <h2>Welcome back</h2>
            <p>Enter your account details to continue.</p>
          </header>

          {success && <div className="auth-success" role="status">{success}</div>}
          {(formError || error) && <div className="error-message" role="alert">{formError || error}</div>}

          <label className="form-field">
            <span>Email address or username</span>
            <div className={`signin-input${emailInvalid ? ' is-invalid' : ''}`}>
              <svg className="signin-input-icon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="7" r="3.2" /><path d="M3.8 16.5c1.2-2.7 3.4-4 6.2-4s5 1.3 6.2 4" /></svg>
              <input type="text" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" aria-invalid={emailInvalid} required />
            </div>
          </label>

          <label className="form-field">
            <span>Password</span>
            <div className={`signin-input${passwordInvalid ? ' is-invalid' : ''}`}>
              <svg className="signin-input-icon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="8.5" width="12" height="8.5" rx="2.5" /><path d="M6.8 8.5V6.3a3.2 3.2 0 0 1 6.4 0v2.2" /></svg>
              <input autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" aria-invalid={passwordInvalid} required />
              <button type="button" className="signin-eye" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((show) => !show)}>
                {showPassword
                  ? <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Z" /><circle cx="10" cy="10" r="2.3" /><path d="M3.5 3.5l13 13" /></svg>
                  : <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Z" /><circle cx="10" cy="10" r="2.3" /></svg>}
              </button>
            </div>
          </label>

          <button className="button button-primary login-submit" disabled={loading}>
            <span>{loading ? 'Signing in…' : 'Sign in'}</span>
          </button>

          <div className="auth-divider"><span>or</span></div>

          <div className="signin-google">
            <GoogleSignInButton onCredential={googleCredential} onError={setFormError} fluid shape="pill" />
          </div>

          <button type="button" className="signin-forgot" onClick={() => navigate('/auth/forgot-password')}>Forgot password?</button>
        </div>
      </div>

      <p className="auth-switch">New to DriveRent? <button type="button" onClick={() => navigate('/auth/sign-up')}>Create an account</button></p>
      <div className="login-safe">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
        Your account is securely authenticated.
      </div>
    </form>
  </div>
}
