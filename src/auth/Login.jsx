import { useEffect, useState } from 'react'
import { api } from '../api'
import GoogleSignInButton from './GoogleSignInButton.jsx'

export default function Login({ onLogin, onGoogleLogin, navigate, onError, error }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState(() => window.sessionStorage.getItem('authSuccess') || '')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (success) window.sessionStorage.removeItem('authSuccess')
  }, [success])

  const submit = async (event) => {
    event.preventDefault()
    setFormError('')
    setSuccess('')
    setNeedsVerification(false)
    onError('')
    if (!email.trim() || !password) {
      setFormError('Email and password are required.')
      return
    }
    setLoading(true)
    try {
      await onLogin({ email: email.trim(), password })
    } catch (requestError) {
      setFormError(requestError.message)
      setNeedsVerification(requestError.code === 'email_not_verified')
    } finally {
      setLoading(false)
    }
  }

  const resendVerification = async () => {
    setResending(true)
    try {
      const response = await api.post('/api/email/resend', { email: email.trim() })
      setFormError('')
      setNeedsVerification(false)
      setSuccess(response.message)
    } catch (requestError) {
      setFormError(requestError.message)
    } finally {
      setResending(false)
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
      <div className="login-brand"><button className="logo" onClick={() => navigate('/')} aria-label="DriveRent home"><span className="logo-symbol">D</span><span>Drive<span>Rent</span></span></button></div>
      <span className="eyebrow light">WELCOME TO DRIVERENT</span>
      <h1>Your next<br /><em>journey starts here.</em></h1>
      <p>Sign in to see the fleet and make the road your own.</p>
      <span className="login-side-note">GO FURTHER. FEEL CLOSER.</span>
    </section>
    <form className="login-form" onSubmit={submit} noValidate>
      <div><span className="eyebrow">YOUR ACCOUNT</span><h2>Welcome back</h2><p>Enter your account details to continue.</p></div>
      {success && <div className="auth-success" role="status">{success}</div>}
      {(formError || error) && <div className="error-message" role="alert">{formError || error}</div>}
      {needsVerification && <button type="button" className="button button-outline" onClick={resendVerification} disabled={resending || !email.includes('@')}>
        {resending ? 'Sending…' : 'Send a new verification link'}
      </button>}
      <GoogleSignInButton onCredential={googleCredential} onError={setFormError} />
      <div className="auth-divider"><span>or use email</span></div>
      <label className="form-field"><span>Email address or username</span><input type="text" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
      <label className="form-field"><span>Password</span><div className="password-input"><input autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword((show) => !show)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
      <p className="auth-switch"><button type="button" onClick={() => navigate('/auth/forgot-password')}>Forgot password?</button></p>
      <button className="button button-primary login-submit" disabled={loading}>{loading ? <><span className="button-spinner" />Signing in…</> : 'Sign in'}</button>
      <p className="auth-switch">New to DriveRent? <button type="button" onClick={() => navigate('/auth/sign-up')}>Create an account</button></p>
      <div className="login-safe">Your account is securely authenticated.</div>
    </form>
  </div>
}
