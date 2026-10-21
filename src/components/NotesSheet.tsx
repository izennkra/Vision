// Notes telles qu'on les lit pendant l'enregistrement (fenêtre flottante) : une colonne, lisible,
// hiérarchie par la taille, couleur et soulignage par bloc, séparateurs. La taille de base se règle.
import type { NotesDoc } from '../lib/notes'

export function NotesSheet({ doc, className = '' }: { doc: NotesDoc; className?: string }) {
  return (
    <div className={`notes ${className}`} style={{ fontSize: doc.scale }}>
      {doc.blocks.map((b) =>
        b.kind === 'hr' ? (
          <hr key={b.id} className="notes__hr" />
        ) : b.text.trim() ? (
          <p
            key={b.id}
            className={`notes__block notes__block--${b.kind} is-${b.size}${b.underline ? ' is-underline' : ''}`}
            style={b.color ? { color: b.color } : undefined}
          >
            {b.text}
          </p>
        ) : null,
      )}
    </div>
  )
}
