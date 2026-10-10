// Connexion du propriétaire (mode en ligne). Les pages client (/v/…) restent publiques.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { api, saveSession } from '../lib/api'
import './login.css'

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
    <div className="login">
      <form className="login__box" onSubmit={submit}>
        <Logo />
        <h1 className="login__title">Connexion à Visions</h1>
        <input
          className="login__field"
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="ds-btn-primary login__go" disabled={busy}>{busy ? 'Connexion…' : 'Entrer'}</button>
        <p className="login__error" role="alert">{error}</p>
      </form>
    </div>
  )
}
