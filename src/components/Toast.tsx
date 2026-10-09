// Message bref en bas de l'écran (« Lien copié », « Vidéo enregistrée »…).
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

const ToastContext = createContext<(message: string) => void>(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null)
  const timer = useRef<number>(undefined)
  const show = useCallback((text: string) => {
    window.clearTimeout(timer.current)
    setMsg({ text, key: Date.now() })
    timer.current = window.setTimeout(() => setMsg(null), 2200)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg && (
        <div key={msg.key} className="ds-toast" role="status">
          {msg.text}
        </div>
      )}
    </ToastContext.Provider>
  )
}
