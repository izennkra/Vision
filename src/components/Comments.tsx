// Panneau des commentaires : liste (temps cliquable qui amène la vidéo à ce moment, réponses),
// compteur, champ avec dictée vocale et bouton d'envoi.
import { useEffect, useRef, useState } from 'react'
import type { Comment, ID } from '../data'
import { useDictation } from '../hooks/useDictation'
import { clock, plural, timeAgo } from '../lib/format'
import { useContextMenu } from './ContextMenu'
import { IconMic, IconReply, IconSend } from './icons'

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

interface Props {
  comments: Comment[]
  /** Nom de la personne qui commente (null : on le demande dans le champ). */
  author: string | null
  onAuthorChange?: (name: string) => void
  canDelete: boolean
  onSeek: (seconds: number) => void
  currentTime: () => number
  onAdd: (input: { text: string; timestamp: number | null; parentId: ID | null; authorName: string }) => Promise<void>
  onDelete: (id: ID) => void
}

export function Comments({ comments, author, onAuthorChange, canDelete, onSeek, currentTime, onAdd, onDelete }: Props) {
  const openMenu = useContextMenu()
  const [text, setText] = useState('')
  const [name, setName] = useState(author ?? '')
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

  const who = (author ?? name).trim()
  const send = async () => {
    const body = text.trim()
    if (!body || !who || sending) return
    setSending(true)
    if (!author) onAuthorChange?.(who)
    await onAdd({
      text: body,
      parentId: replyTo?.id ?? null,
      timestamp: replyTo ? null : Math.floor(currentTime()),
      authorName: who,
    })
    setText('')
    setReplyTo(null)
    setSending(false)
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
        <span className="ds-initials">{c.authorInitials}</span>
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
    <aside className="comments">
      <div ref={list} className="comments__list">
        <div className="comments__inner">{roots.map((c) => item(c))}</div>
      </div>

      <div className="comments__count">
        {replyTo ? (
          <>
            Réponse à {replyTo.authorName}
            <button className="ds-hover comments__cancel" onClick={() => setReplyTo(null)}>Annuler</button>
          </>
        ) : (
          plural(comments.length, 'Commentaire', 'Commentaires')
        )}
      </div>

      <div className="comments__compose">
        <div className="ds-comment-input comments__input" onClick={() => field.current?.focus()}>
          <span className="ds-initials">{initialsOf(who)}</span>
          <div className="comments__fields">
            {!author && (
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={replyTo ? `Répondre à ${replyTo.authorName}...` : 'Écrire un commentaire...'}
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
        <button className="ds-round-primary comments__send" onClick={send} aria-label="Envoyer">
          <IconSend size={30} />
        </button>
      </div>
    </aside>
  )
}
