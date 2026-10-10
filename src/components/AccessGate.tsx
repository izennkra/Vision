// Page client verrouillée : saisie du code d'accès (6 caractères), ou invitation nécessaire (vidéo privée).
import { useRef, useState } from 'react'
import { owner } from '../config'
import { IconLock } from './icons'
import { Logo } from './Logo'
import '../styles/entry.css'

export const CODE_LENGTH = 6

interface Props {
  lock: { locked: 'code' | 'private'; codeAllowed: boolean }
  onUnlock: (code: string) => Promise<boolean>
  onDone: () => void
}

export function AccessGate({ lock, onUnlock, onDone }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const isPrivate = lock.locked === 'private'

  const submit = async (value = code) => {
    if (value.length !== CODE_LENGTH || busy) return
    setBusy(true)
    const ok = await onUnlock(value)
    setBusy(false)
    if (ok) return onDone()
    setError(true)
    input.current?.focus()
  }

  const text =
    isPrivate && !lock.codeAllowed
      ? 'Cette vidéo est réservée aux personnes invitées. Ouvrez le lien personnel reçu par e-mail.'
      : isPrivate
        ? `Entrez le code d’accès envoyé par ${owner.fullName}, ou ouvrez le lien personnel reçu par e-mail.`
        : `Entrez le code d’accès pour visionner la vidéo envoyée par ${owner.fullName}.`

  return (
    <div className="entry entry--code">
      <div className="entry__logo"><Logo /></div>
      <form
        className="entry__form"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="entry__card">
          <span className="entry__lock"><IconLock size={22} /></span>
          <h1 className="entry__title">Bienvenue dans<span className="ds-accent-link">Visions</span></h1>
          <p className="entry__text">{text}</p>
          {lock.codeAllowed && (
            <div className={`code${error ? ' is-error' : ''}`} onClick={() => input.current?.focus()}>
              <input
                ref={input}
                className="code__input"
                value={code}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
                  setCode(v)
                  setError(false)
                  if (v.length === CODE_LENGTH) void submit(v) // dernier caractère : on valide tout seul
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoFocus
                autoComplete="one-time-code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                maxLength={CODE_LENGTH}
                aria-label="Code d’accès (6 caractères)"
                aria-invalid={error}
              />
              {Array.from({ length: CODE_LENGTH }, (_, i) => (
                <span
                  key={i}
                  className={`code__box${code[i] ? ' is-filled' : ''}${focused && !busy && i === Math.min(code.length, CODE_LENGTH - 1) && !code[i] ? ' is-focus' : ''}`}
                  aria-hidden
                >
                  {code[i] ?? ''}
                </span>
              ))}
            </div>
          )}
        </div>
        {lock.codeAllowed && (
          <button className="entry__go" disabled={code.length !== CODE_LENGTH || busy}>{busy ? '...' : 'Entrer'}</button>
        )}
        <p className="entry__error" role="alert">{error ? 'Code incorrect, vérifiez et réessayez.' : ''}</p>
      </form>
    </div>
  )
}
