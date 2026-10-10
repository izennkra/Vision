// Panneau des commentaires : liste (temps cliquable qui amène la vidéo à ce moment, réponses),
// compteur, champ avec dictée vocale et bouton d'envoi.
import { useEffect, useRef, useState } from 'react'
import type { Comment, ID } from '../data'
import { useDictation } from '../hooks/useDictation'
import { clock, plural, timeAgo } from '../lib/format'
import { useContextMenu } from './ContextMenu'
import { IconCaretDown, IconCheck, IconMic, IconReply, IconSend } from './icons'
import { Initials } from './Initials'

export const ANONYMOUS = 'Anonyme'

/** Mise en page téléphone (même seuil que le CSS). */
const phone = () => matchMedia('(max-width: 600px)').matches

export { initialsOf } from './Initials'

interface Props {
  comments: Comment[]
  /** Nom imposé de la personne qui commente (propriétaire, lien personnel). Sinon : profil choisi ou nom saisi. */
  author: string | null
  /** Profils prévus par le propriétaire : on choisit le sien au moment de commenter (« Anonyme » en plus). */
  profiles?: string[]
  /** Profil déjà choisi sur cette vidéo. */
  profile?: string | null
  onAuthorChange?: (name: string) => void
  canDelete: boolean
  onSeek: (seconds: number) => void
  currentTime: () => number
  onAdd: (input: { text: string; timestamp: number | null; parentId: ID | null; authorName: string }) => Promise<void>
  onDelete: (id: ID) => void
  /** Position actuelle de la vidéo (secondes), affichée dans le champ. */
  nowLabel?: number
}

export function Comments({ comments, author, profiles, profile = null, onAuthorChange, canDelete, onSeek, currentTime, onAdd, onDelete, nowLabel = 0 }: Props) {
  const openMenu = useContextMenu()
  const [text, setText] = useState('')
  const [name, setName] = useState(author ?? '')
  const picking = !author && !!profiles?.length
  const [chosen, setChosen] = useState<string | null>(profile)
  const chosenRef = useRef(chosen)
  chosenRef.current = chosen
  const [picker, setPicker] = useState(false)
  const sendAfterPick = useRef(false)
  const compose = useRef<HTMLDivElement>(null)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [sending, setSending] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const dictation = useDictation((t) => setText((v) => (v ? `${v} ${t}` : t)))

  const roots = comments.filter((c) => !c.parentId)
  const repliesOf = (id: ID) => comments.filter((c) => c.parentId === id)

  // Nouveau commentaire : on garde la liste calée en bas.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [comments.length])

  useEffect(() => setChosen(profile), [profile])

  // Téléphone : le champ grandit avec le texte (une ligne au départ, cinq au plus).
  useEffect(() => {
    const el = field.current
    if (!el || !phone()) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text])

  // Le choix du profil se ferme d'un clic ailleurs ou avec Échap.
  useEffect(() => {
    if (!picker) return
    const outside = (e: PointerEvent) => !compose.current?.contains(e.target as Node) && setPicker(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPicker(false)
    document.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('keydown', esc)
    }
  }, [picker])

  const who = (author ?? (picking ? chosen ?? '' : name)).trim()
  const send = async (as = who) => {
    const body = text.trim()
    if (!body || sending) return
    if (!as) {
      if (picking) {
        sendAfterPick.current = true
        setPicker(true)
      } else document.querySelector<HTMLInputElement>('.comments__name')?.focus()
      return
    }
    setSending(true)
    if (!author && !picking) onAuthorChange?.(as)
    await onAdd({
      text: body,
      parentId: replyTo?.id ?? null,
      timestamp: replyTo ? null : Math.floor(currentTime()),
      authorName: as,
    })
    setText('')
    setReplyTo(null)
    setSending(false)
  }

  const choose = (p: string) => {
    chosenRef.current = p
    setChosen(p)
    setPicker(false)
    onAuthorChange?.(p)
    if (sendAfterPick.current) {
      sendAfterPick.current = false
      void send(p)
    } else field.current?.focus() // tout de suite : sur iPhone, le clavier ne s'ouvre que pendant le toucher
  }

  const reply = (c: Comment) => {
    setReplyTo(c)
    field.current?.focus()
  }

  const item = (c: Comment, isReply = false) => (
    <div
      key={c.id}
      className={`comment${isReply ? ' comment--reply' : ''}`}
      onContextMenu={(e) =>
        canDelete &&
        openMenu(e, [
          { label: 'Répondre', onSelect: () => reply(c) },
          'separator',
          { label: 'Supprimer le commentaire', confirm: 'Confirmer la suppression', danger: true, onSelect: () => onDelete(c.id) },
        ])
      }
    >
      <div className="ds-comment__head">
        <Initials name={c.authorName} />
        <span>{c.authorName}</span>
        {c.timestamp !== null && (
          <button className="ds-comment__time" onClick={() => onSeek(c.timestamp!)}>{clock(c.timestamp)}</button>
        )}
        <span className="ds-comment__age">{timeAgo(c.createdAt)}</span>
      </div>
      <div className="ds-comment__text">{c.text}</div>
      {!isReply && (
        <button className="ds-comment__reply" onClick={() => reply(c)}>
          <IconReply />Répondre
        </button>
      )}
      {repliesOf(c.id).map((r) => item(r, true))}
    </div>
  )

  return (
    <div className="comments">
      <div ref={list} className="comments__list">
        <div className="comments__inner">{roots.map((c) => item(c))}</div>
      </div>

      <div className="comments__footer">
      <div className={`comments__count${replyTo ? ' is-reply' : ''}`}>
        {replyTo ? (
          <>
            Réponse à {replyTo.authorName}
            <button className="ds-hover comments__cancel" onClick={() => setReplyTo(null)}>Annuler</button>
          </>
        ) : (
          plural(comments.length, 'Commentaire', 'Commentaires')
        )}
      </div>

      <div ref={compose} className="comments__compose">
        {picker && profiles && <div className="who__backdrop" onClick={() => setPicker(false)} aria-hidden />}
        {picker && profiles && (
          <div className="who" role="dialog" aria-label="Qui êtes-vous ?">
            <span className="who__grip" aria-hidden />
            <div className="who__title">Qui êtes-vous ?</div>
            <div className="who__hint">Votre nom apparaîtra avec vos commentaires.</div>
            <div className="who__list">
              {[...profiles, ANONYMOUS].map((p) => (
                <button key={p} className={`who__item${p === chosen ? ' is-on' : ''}${p === ANONYMOUS ? ' is-anon' : ''}`} onClick={() => choose(p)}>
                  <Initials name={p} />
                  <span className="who__name">{p}</span>
                  {p === chosen && <IconCheck size={14} />}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="ds-comment-input comments__input" onClick={(e) => e.target === e.currentTarget && field.current?.focus()}>
          {picking ? (
            <button
              className={`ds-hover comments__who${chosen ? '' : ' is-empty'}`}
              onClick={() => setPicker((o) => !o)}
              aria-label={chosen ? `Commenter en tant que ${chosen} — changer` : 'Choisir votre nom'}
              title={chosen ? `${chosen} — changer` : 'Choisir votre nom'}
            >
              <Initials name={chosen} />
              <IconCaretDown size={10} />
            </button>
          ) : (
            <Initials name={who} />
          )}
          <div className="comments__fields">
            {picking && (
              <button className="ds-hover comments__as" onClick={() => setPicker((o) => !o)}>
                {chosen ? <>En tant que <strong>{chosen}</strong></> : 'Choisir votre nom'}
              </button>
            )}
            {!author && !picking && (
              <input
                className="ds-edit comments__name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Votre nom"
              />
            )}
            <textarea
              ref={field}
              className="ds-edit comments__text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={1}
              onFocus={(e) => {
                if (!picking || chosenRef.current) return
                setPicker(true)
                // Téléphone : on choisit d'abord son nom, le clavier s'ouvre ensuite.
                if (phone()) e.currentTarget.blur()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={replyTo ? `Répondre à ${replyTo.authorName}...` : `Commenter à ${clock(nowLabel)}...`}
            />
          </div>
          <button
            className={`ds-hover comments__mic${dictation.listening ? ' is-listening' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              dictation.toggle()
            }}
            disabled={!dictation.supported}
            aria-label="Dicter le commentaire"
            title={dictation.supported ? 'Dicter' : 'Dictée non disponible dans ce navigateur'}
          >
            <IconMic size={20} weight="regular" />
          </button>
        </div>
        <button className="ds-round-primary comments__send" onClick={() => send()} aria-label="Envoyer">
          <IconSend size={30} />
        </button>
      </div>
      </div>
    </div>
  )
}
