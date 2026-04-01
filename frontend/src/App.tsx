import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { queryClient } from './lib/queryClient'
import { useAuthStore } from './stores/authStore'
import { APP_BASE, api } from './lib/api'
import { Layout, canAccess } from './components/Layout'
import type { NavGate } from './components/Layout'
import { useTheme } from './hooks/useTheme'

// Eager: Login (entry point) + Dashboard (most visited) + Setup (first-run)
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Setup } from './pages/Setup'

// Lazy-loaded pages
const Members = lazy(() => import('./pages/Members').then(m => ({ default: m.Members })))
const MemberDetail = lazy(() => import('./pages/MemberDetail').then(m => ({ default: m.MemberDetail })))
const Scan = lazy(() => import('./pages/Scan').then(m => ({ default: m.Scan })))
const Analytics = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })))
const Offers = lazy(() => import('./pages/Offers').then(m => ({ default: m.Offers })))
const AiInsights = lazy(() => import('./pages/AiInsights').then(m => ({ default: m.AiInsights })))
const ChatbotConfig = lazy(() => import('./pages/ChatbotConfig').then(m => ({ default: m.ChatbotConfig })))
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase').then(m => ({ default: m.KnowledgeBase })))
const WidgetBuilder = lazy(() => import('./pages/WidgetBuilder').then(m => ({ default: m.WidgetBuilder })))
const Notifications = lazy(() => import('./pages/Notifications').then(m => ({ default: m.Notifications })))
const EmailTemplates = lazy(() => import('./pages/EmailTemplates').then(m => ({ default: m.EmailTemplates })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const Benefits = lazy(() => import('./pages/Benefits').then(m => ({ default: m.Benefits })))
const Properties = lazy(() => import('./pages/Properties').then(m => ({ default: m.Properties })))
const Tiers = lazy(() => import('./pages/Tiers').then(m => ({ default: m.Tiers })))
const Guests = lazy(() => import('./pages/Guests').then(m => ({ default: m.Guests })))
const GuestDetail = lazy(() => import('./pages/GuestDetail').then(m => ({ default: m.GuestDetail })))
const Inquiries = lazy(() => import('./pages/Inquiries').then(m => ({ default: m.Inquiries })))
const Reservations = lazy(() => import('./pages/Reservations').then(m => ({ default: m.Reservations })))
const Corporate = lazy(() => import('./pages/Corporate').then(m => ({ default: m.Corporate })))
const Planner = lazy(() => import('./pages/Planner').then(m => ({ default: m.Planner })))
const Venues = lazy(() => import('./pages/Venues').then(m => ({ default: m.Venues })))
const AuditLog = lazy(() => import('./pages/AuditLog').then(m => ({ default: m.AuditLog })))
const Bookings = lazy(() => import('./pages/Bookings').then(m => ({ default: m.Bookings })))
const BookingDetail = lazy(() => import('./pages/BookingDetail').then(m => ({ default: m.BookingDetail })))
const BookingCalendar = lazy(() => import('./pages/BookingCalendar').then(m => ({ default: m.BookingCalendar })))
const BookingPayments = lazy(() => import('./pages/BookingPayments').then(m => ({ default: m.BookingPayments })))
const BookingSubmissions = lazy(() => import('./pages/BookingSubmissions').then(m => ({ default: m.BookingSubmissions })))
const AiChat = lazy(() => import('./components/AiChat'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ThemeLoader() {
  useTheme()
  return null
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore()
  const [setupDone, setSetupDone] = useState<boolean | null>(null)

  useEffect(() => {
    if (!token || user?.user_type !== 'staff') {
      setSetupDone(true) // members skip setup check
      return
    }
    api.get('/v1/admin/setup/status')
      .then(r => setSetupDone(r.data.setup_complete))
      .catch(() => setSetupDone(true)) // fail open
  }, [token, user])

  if (!token) return <Navigate to="/login" replace />
  if (setupDone === null) return <PageLoader />
  if (!setupDone) return <Setup onComplete={() => setSetupDone(true)} />
  return <Layout>{children}</Layout>
}

function GatedRoute({ gate, children }: { gate?: NavGate; children: React.ReactNode }) {
  const { staff } = useAuthStore()
  if (gate && !canAccess(gate, staff)) return <Navigate to="/" replace />
  return <>{children}</>
}

function LazyRoute({ children, gate }: { children: React.ReactNode; gate?: NavGate }) {
  return (
    <ProtectedRoute>
      <GatedRoute gate={gate}>
        <Suspense fallback={<PageLoader />}>{children}</Suspense>
      </GatedRoute>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeLoader />
      <BrowserRouter basename={APP_BASE || undefined}>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/scan" element={<LazyRoute><Scan /></LazyRoute>} />
          <Route path="/members" element={<LazyRoute><Members /></LazyRoute>} />
          <Route path="/members/:id" element={<LazyRoute><MemberDetail /></LazyRoute>} />
          <Route path="/offers" element={<LazyRoute gate="can_manage_offers"><Offers /></LazyRoute>} />
          <Route path="/analytics" element={<LazyRoute gate="can_view_analytics"><Analytics /></LazyRoute>} />
          <Route path="/ai" element={<LazyRoute gate="can_view_analytics"><AiInsights /></LazyRoute>} />
          <Route path="/chatbot-config" element={<LazyRoute gate="admin"><ChatbotConfig /></LazyRoute>} />
          <Route path="/knowledge-base" element={<LazyRoute gate="admin"><KnowledgeBase /></LazyRoute>} />
          <Route path="/widget-builder" element={<LazyRoute gate="admin"><WidgetBuilder /></LazyRoute>} />
          <Route path="/notifications" element={<LazyRoute gate="admin"><Notifications /></LazyRoute>} />
          <Route path="/email-templates" element={<LazyRoute gate="admin"><EmailTemplates /></LazyRoute>} />
          <Route path="/tiers" element={<LazyRoute gate="admin"><Tiers /></LazyRoute>} />
          <Route path="/benefits" element={<LazyRoute gate="admin"><Benefits /></LazyRoute>} />
          <Route path="/properties" element={<LazyRoute gate="admin"><Properties /></LazyRoute>} />
          <Route path="/guests" element={<LazyRoute><Guests /></LazyRoute>} />
          <Route path="/guests/:id" element={<LazyRoute><GuestDetail /></LazyRoute>} />
          <Route path="/inquiries" element={<LazyRoute><Inquiries /></LazyRoute>} />
          <Route path="/reservations" element={<LazyRoute><Reservations /></LazyRoute>} />
          <Route path="/corporate" element={<LazyRoute gate="admin"><Corporate /></LazyRoute>} />
          <Route path="/planner" element={<LazyRoute><Planner /></LazyRoute>} />
          <Route path="/venues" element={<LazyRoute gate="admin"><Venues /></LazyRoute>} />
          <Route path="/bookings" element={<LazyRoute><Bookings /></LazyRoute>} />
          <Route path="/bookings/calendar" element={<LazyRoute><BookingCalendar /></LazyRoute>} />
          <Route path="/bookings/payments" element={<LazyRoute><BookingPayments /></LazyRoute>} />
          <Route path="/bookings/submissions" element={<LazyRoute gate="admin"><BookingSubmissions /></LazyRoute>} />
          <Route path="/bookings/:id" element={<LazyRoute><BookingDetail /></LazyRoute>} />
          <Route path="/audit-log" element={<LazyRoute gate="admin"><AuditLog /></LazyRoute>} />
          <Route path="/settings" element={<LazyRoute gate="admin"><Settings /></LazyRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Suspense fallback={null}><AiChat /></Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
