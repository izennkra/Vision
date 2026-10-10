// Connexion du propriétaire (mode en ligne). Les pages client (/v/…) restent publiques.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { api, saveSession } from '../lib/api'
import '../styles/entry.css'

export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      const { token } = await api<{ token: string }>('login', { method: 'POST', json: { password } })
      saveSession(token)
      navigate(params.get('next') || '/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible')
      setBusy(false)
    }
  }

  return (
    <div className="entry entry--login">
      <div className="entry__logo"><Logo /></div>
      <form className="entry__form" onSubmit={submit}>
        <div className="entry__card">
          <h1 className="entry__title">Connexion à<span className="ds-accent-link">Visions</span></h1>
          <input
            className="entry__field"
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
            aria-label="Mot de passe"
          />
        </div>
        <button className="entry__go" disabled={busy || !password}>{busy ? '...' : 'Entrer'}</button>
        <p className="entry__error" role="alert">{error}</p>
      </form>
    </div>
  )
}
