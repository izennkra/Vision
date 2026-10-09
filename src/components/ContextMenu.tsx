// Menu contextuel (clic droit) : actions essentielles, confirmation en deux clics pour les suppressions,
// sous-liste pour « Déplacer vers… ».
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type MenuItem =
  | { label: string; onSelect: () => void; danger?: boolean; confirm?: string; muted?: boolean }
  | { label: string; children: MenuItem[] }
  | 'separator'

type Open = (e: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[]) => void

const MenuContext = createContext<Open>(() => {})

export const useContextMenu = () => useContext(MenuContext)

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const open = useCallback<Open>((e, items) => {
    e.preventDefault?.()
    setState({ x: e.clientX, y: e.clientY, items })
  }, [])
  const close = useCallback(() => setState(null), [])

  return (
    <MenuContext.Provider value={open}>
      {children}
      {state && createPortal(<Menu {...state} onClose={close} />, document.body)}
    </MenuContext.Provider>
  )
}

function Menu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [stack, setStack] = useState<MenuItem[][]>([items])
  const [armed, setArmed] = useState<string | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const current = stack[stack.length - 1]

  // Garde le menu dans la fenêtre.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.min(x, window.innerWidth - r.width - 8),
      top: Math.min(y, window.innerHeight - r.height - 8),
    })
  }, [x, y, current])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  return (
    <div ref={ref} className="ds-menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
      {stack.length > 1 && (
        <>
          <button className="ds-menu__item is-muted" onClick={() => setStack((s) => s.slice(0, -1))}>← Retour</button>
          <div className="ds-menu__sep" />
        </>
      )}
      {current.map((item, i) => {
        if (item === 'separator') return <div key={i} className="ds-menu__sep" />
        if ('children' in item)
          return (
            <button key={i} className="ds-menu__item" onClick={() => setStack((s) => [...s, item.children])}>
              {item.label}<span style={{ marginLeft: 'auto' }}>›</span>
            </button>
          )
        const isArmed = armed === item.label
        return (
          <button
            key={i}
            className={`ds-menu__item${item.danger ? ' is-danger' : ''}${item.muted ? ' is-muted' : ''}`}
            onClick={() => {
              if (item.confirm && !isArmed) return setArmed(item.label)
              onClose()
              item.onSelect()
            }}
          >
            {isArmed ? item.confirm : item.label}
          </button>
        )
      })}
    </div>
  )
}
