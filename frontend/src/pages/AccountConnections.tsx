import { ArrowLeft } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { ChatGptConnectionsPanel } from '../components/ChatGptConnectionsPanel'
import { useAuthStore } from '../stores/authStore'

// Personal account controls must remain reachable without admin permissions,
// a subscription, or the Layout's feature-page and polling gates.
export function AccountConnections() {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.user_type !== 'staff') return <Navigate to="/portal" replace />

  return (
    <main className="min-h-screen bg-[#eaeef2] text-[#1b2a34]">
      <header className="bg-[#0e1a24] px-5 py-8 text-[#f4f6f8] sm:px-8">
        <div className="mx-auto max-w-2xl">
          <Link to="/" className="inline-flex min-h-10 items-center gap-2 rounded text-sm text-[#c1cdd4] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <ArrowLeft size={16} aria-hidden="true" /> Back to Hexa-Tech
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">Your connected apps</h1>
          <p className="mt-2 break-words text-sm text-[#c1cdd4]">{user.email}</p>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-0 sm:py-8">
        <ChatGptConnectionsPanel />
      </div>
    </main>
  )
}
