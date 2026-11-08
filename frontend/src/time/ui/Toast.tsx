import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle } from 'lucide-react'

type ToastTone = 'success' | 'danger'
interface Toast { id: number; text: string; tone: ToastTone }

const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => {})

/** Say that something happened ("Saved", "Sent"): a short line at the foot of the screen, read out politely. */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): (text: string, tone?: ToastTone) => void {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(1)
  const timers = useRef<number[]>([])
  useEffect(() => () => { timers.current.forEach(id => window.clearTimeout(id)) }, [])

  const say = useCallback((text: string, tone: ToastTone = 'success') => {
    const id = next.current++
    setToasts(list => [...list.slice(-2), { id, text, tone }])
    timers.current.push(window.setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), tone === 'danger' ? 6000 : 3500))
  }, [])

  return (
    <ToastContext.Provider value={say}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map(toast => (
          <div key={toast.id} role={toast.tone === 'danger' ? 'alert' : 'status'}
            className="pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border border-a-border bg-a-surface px-4 py-2.5 text-sm text-a-text shadow-a-lg animate-a-pop">
            {toast.tone === 'danger'
              ? <AlertTriangle size={16} aria-hidden className="shrink-0 text-a-danger" />
              : <CheckCircle2 size={16} aria-hidden className="shrink-0 text-a-st-confirmed" />}
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
