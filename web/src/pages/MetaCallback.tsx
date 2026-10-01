import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { completeMetaConnect } from '../lib/meta'

// Facebook sends the browser back here with ?code=...&state=... (or ?error=... if the user cancelled).
export default function MetaCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const started = useRef(false) // the code works once; React StrictMode would otherwise run this twice in dev
  const [requestError, setRequestError] = useState<string | null>(null)

  // Facebook reports problems as error_description (OAuth errors) or error_message (dialog errors).
  const denied = params.get('error_description') ?? params.get('error_message') ?? params.get('error')
  const code = params.get('code')
  const state = params.get('state')
  const paramError = denied
    ? `Meta did not complete the login: ${denied}`
    : !code || !state
      ? 'The Meta login did not return what we need. Please try again.'
      : null
  const error = paramError ?? requestError

  useEffect(() => {
    if (paramError || !code || !state || started.current) return
    started.current = true
    completeMetaConnect(code, state)
      .then(() => navigate('/?meta=connected', { replace: true }))
      .catch((e: Error) => setRequestError(e.message))
  }, [paramError, code, state, navigate])

  return (
    <main className="auth-page">
      <div className="card">
        {error ? (
          <>
            <h1>Could not connect</h1>
            <p className="error" role="alert">{error}</p>
            <Link to="/">Back to dashboard</Link>
          </>
        ) : (
          <>
            <h1>Connecting your Meta account...</h1>
            <p>This takes a few seconds. Please keep this tab open.</p>
          </>
        )}
      </div>
    </main>
  )
}
