import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, CheckCircle2 } from 'lucide-react'

type ToastTone = 'success' | 'danger' | 'info'
/** Round 5: a toast may carry one link (an alert's "Open"); it then stays longer. */
interface ToastOptions { action?: { label: string; to: string } }
interface Toast { id: number; text: string; tone: ToastTone; action?: ToastOptions['action'] }
type Say = (text: string, tone?: ToastTone, options?: ToastOptions) => void

const ToastContext = createContext<Say>(() => {})

/** Say that something happened ("Saved", "Sent"): a short line at the foot of the screen, read out politely. */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): Say {
  return useContext(ToastContext)
}

const ICON: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={16} aria-hidden className="shrink-0 text-a-st-confirmed" />,
  danger: <AlertTriangle size={16} aria-hidden className="shrink-0 text-a-danger" />,
  info: <Bell size={16} aria-hidden className="shrink-0 text-a-accent-text" />,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(1)
  const timers = useRef<number[]>([])
  useEffect(() => () => { timers.current.forEach(id => window.clearTimeout(id)) }, [])

  const say = useCallback<Say>((text, tone = 'success', options) => {
    const id = next.current++
    const action = options?.action
    setToasts(list => [...list.slice(-2), { id, text, tone, action }])
    const life = action ? 9000 : tone === 'danger' ? 6000 : 3500
    timers.current.push(window.setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), life))
  }, [])
  const drop = (id: number) => setToasts(list => list.filter(t => t.id !== id))

  return (
    <ToastContext.Provider value={say}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map(toast => (
          <div key={toast.id} role={toast.tone === 'danger' ? 'alert' : 'status'}
            className="pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border border-a-border bg-a-surface px-4 py-2.5 text-sm text-a-text shadow-a-lg animate-a-pop">
            {ICON[toast.tone]}
            <span className="min-w-0">{toast.text}</span>
            {toast.action && (
              <Link to={toast.action.to} onClick={() => drop(toast.id)}
                className="ml-2 shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-a-accent-text hover:bg-a-accent/10 focus-visible:outline-2 focus-visible:outline-a-accent">
                {toast.action.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
