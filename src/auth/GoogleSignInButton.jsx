import { useEffect, useRef, useState } from 'react'

const GOOGLE_SCRIPT_ID = 'google-identity-services'

export default function GoogleSignInButton({ onCredential, onError }) {
  const buttonRef = useRef(null)
  const callbacks = useRef({ onCredential, onError })
  const [scriptReady, setScriptReady] = useState(Boolean(window.google?.accounts?.id))
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  useEffect(() => {
    callbacks.current = { onCredential, onError }
  }, [onCredential, onError])

  useEffect(() => {
    if (!clientId) return undefined

    let active = true
    const renderButton = () => {
      if (!active || !window.google?.accounts?.id || !buttonRef.current) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: 'popup',
        callback: (response) => {
          if (response?.credential) callbacks.current.onCredential(response.credential)
          else callbacks.current.onError('Google did not return an identity credential.')
        },
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: 320,
      })
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed?.() && notification.getNotDisplayedReason?.()) {
          callbacks.current.onError(`Google sign-in could not open: ${notification.getNotDisplayedReason()}.`)
        } else if (notification.isSkippedMoment?.() && notification.getSkippedReason?.()) {
          callbacks.current.onError(`Google sign-in was cancelled: ${notification.getSkippedReason()}.`)
        }
      })
      setScriptReady(true)
    }

    let script = document.getElementById(GOOGLE_SCRIPT_ID)
    if (window.google?.accounts?.id) {
      renderButton()
    } else if (script) {
      script.addEventListener('load', renderButton)
    } else {
      script = document.createElement('script')
      script.id = GOOGLE_SCRIPT_ID
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = renderButton
      script.onerror = () => callbacks.current.onError('Google sign-in could not be loaded. Check your connection and try again.')
      document.head.appendChild(script)
    }

    return () => {
      active = false
      script?.removeEventListener('load', renderButton)
    }
  }, [clientId])

  if (!clientId) {
    return <p className="google-auth-help">Google sign-in is unavailable until VITE_GOOGLE_CLIENT_ID is configured.</p>
  }

  return (
    <div className={`google-auth-button${scriptReady ? '' : ' is-loading'}`}>
      {!scriptReady && <span className="button-spinner" aria-hidden="true" />}
      <div ref={buttonRef} aria-label="Continue with Google" />
    </div>
  )
}
