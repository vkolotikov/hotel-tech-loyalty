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
import { useSubscription } from './hooks/useSubscription'

// Eager: Login (entry point) + Dashboard (most visited) + Setup (first-run)
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Setup } from './pages/Setup'

// Lazy-loaded pages
const Members = lazy(() => import('./pages/Members').then(m => ({ default: m.Members })))
const MemberDetail = lazy(() => import('./pages/MemberDetail').then(m => ({ default: m.MemberDetail })))
const MemberDuplicates = lazy(() => import('./pages/MemberDuplicates').then(m => ({ default: m.MemberDuplicates })))
const Scan = lazy(() => import('./pages/Scan').then(m => ({ default: m.Scan })))
const Analytics = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })))
const Offers = lazy(() => import('./pages/Offers').then(m => ({ default: m.Offers })))
const AiInsights = lazy(() => import('./pages/AiInsights').then(m => ({ default: m.AiInsights })))
const ChatbotSetup = lazy(() => import('./pages/ChatbotSetup').then(m => ({ default: m.ChatbotSetup })))
const ChatInbox = lazy(() => import('./pages/ChatInbox').then(m => ({ default: m.ChatInbox })))
const Visitors = lazy(() => import('./pages/Visitors').then(m => ({ default: m.Visitors })))
const Notifications = lazy(() => import('./pages/Notifications').then(m => ({ default: m.Notifications })))
const CampaignDetail = lazy(() => import('./pages/CampaignDetail').then(m => ({ default: m.CampaignDetail })))
const Reviews = lazy(() => import('./pages/Reviews').then(m => ({ default: m.Reviews })))
const ReviewFormBuilder = lazy(() => import('./pages/ReviewFormBuilder').then(m => ({ default: m.ReviewFormBuilder })))
const ReviewDetail = lazy(() => import('./pages/ReviewDetail').then(m => ({ default: m.ReviewDetail })))
const EmailTemplates = lazy(() => import('./pages/EmailTemplates').then(m => ({ default: m.EmailTemplates })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const Benefits = lazy(() => import('./pages/Benefits').then(m => ({ default: m.Benefits })))
const Properties = lazy(() => import('./pages/Properties').then(m => ({ default: m.Properties })))
const Tiers = lazy(() => import('./pages/Tiers').then(m => ({ default: m.Tiers })))
const GuestDetail = lazy(() => import('./pages/GuestDetail').then(m => ({ default: m.GuestDetail })))
const Inquiries = lazy(() => import('./pages/Inquiries').then(m => ({ default: m.Inquiries })))
const Corporate = lazy(() => import('./pages/Corporate').then(m => ({ default: m.Corporate })))
const Planner = lazy(() => import('./pages/Planner').then(m => ({ default: m.Planner })))
const Venues = lazy(() => import('./pages/Venues').then(m => ({ default: m.Venues })))
const Billing = lazy(() => import('./pages/Billing').then(m => ({ default: m.Billing })))
const AuditLog = lazy(() => import('./pages/AuditLog').then(m => ({ default: m.AuditLog })))
const Bookings = lazy(() => import('./pages/Bookings').then(m => ({ default: m.Bookings })))
const BookingDetail = lazy(() => import('./pages/BookingDetail').then(m => ({ default: m.BookingDetail })))
const BookingCalendar = lazy(() => import('./pages/BookingCalendar').then(m => ({ default: m.BookingCalendar })))
const BookingPayments = lazy(() => import('./pages/BookingPayments').then(m => ({ default: m.BookingPayments })))
const BookingSubmissions = lazy(() => import('./pages/BookingSubmissions').then(m => ({ default: m.BookingSubmissions })))
const BookingRooms = lazy(() => import('./pages/BookingRooms'))
const BookingExtras = lazy(() => import('./pages/BookingExtras'))
const Services = lazy(() => import('./pages/Services'))
const ServiceMasters = lazy(() => import('./pages/ServiceMasters'))
const ServiceExtras = lazy(() => import('./pages/ServiceExtras'))
const ServiceBookings = lazy(() => import('./pages/ServiceBookings'))
const ServiceBookingCalendar = lazy(() => import('./pages/ServiceBookingCalendar'))
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

function GatedRoute({ gate, product, feature, children }: { gate?: NavGate; product?: string; feature?: string; children: React.ReactNode }) {
  const { staff } = useAuthStore()
  const { hasProduct, hasFeature } = useSubscription()
  if (gate && !canAccess(gate, staff)) return <Navigate to="/" replace />
  if (product && !hasProduct(product)) return <Navigate to="/" replace />
  if (feature && !hasFeature(feature)) return <Navigate to="/" replace />
  return <>{children}</>
}

function LazyRoute({ children, gate, product, feature }: { children: React.ReactNode; gate?: NavGate; product?: string; feature?: string }) {
  return (
    <ProtectedRoute>
      <GatedRoute gate={gate} product={product} feature={feature}>
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
          <Route path="/register" element={<Login />} />
          <Route path="/forgot-password" element={<Login />} />
          <Route path="/reset-password" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/scan" element={<LazyRoute><Scan /></LazyRoute>} />
          <Route path="/members" element={<LazyRoute><Members /></LazyRoute>} />
          <Route path="/members/duplicates" element={<LazyRoute gate="admin"><MemberDuplicates /></LazyRoute>} />
          <Route path="/members/:id" element={<LazyRoute><MemberDetail /></LazyRoute>} />
          <Route path="/offers" element={<LazyRoute gate="can_manage_offers"><Offers /></LazyRoute>} />
          <Route path="/analytics" element={<LazyRoute gate="can_view_analytics" feature="ai_insights"><Analytics /></LazyRoute>} />
          <Route path="/ai" element={<LazyRoute gate="can_view_analytics" feature="ai_insights"><AiInsights /></LazyRoute>} />
          <Route path="/chatbot-setup" element={<LazyRoute gate="admin" product="chat"><ChatbotSetup /></LazyRoute>} />
          {/* Legacy chatbot routes — folded into the unified Chatbot Setup tabs. */}
          <Route path="/chatbot-config" element={<Navigate to="/chatbot-setup" replace />} />
          <Route path="/knowledge-base" element={<Navigate to="/chatbot-setup" replace />} />
          <Route path="/popup-rules" element={<Navigate to="/chatbot-setup" replace />} />
          <Route path="/training" element={<Navigate to="/chatbot-setup" replace />} />
          <Route path="/widget-builder" element={<Navigate to="/chatbot-setup" replace />} />
          {/* Direct routes still mounted for the embedded tab loader to import. */}
          <Route path="/chat-inbox" element={<LazyRoute gate="all" product="chat"><ChatInbox /></LazyRoute>} />
          <Route path="/visitors" element={<LazyRoute gate="all" product="chat"><Visitors /></LazyRoute>} />
          <Route path="/notifications" element={<LazyRoute gate="admin" feature="push_notifications"><Notifications /></LazyRoute>} />
          <Route path="/notifications/:id" element={<LazyRoute gate="admin" feature="push_notifications"><CampaignDetail /></LazyRoute>} />
          <Route path="/reviews" element={<LazyRoute gate="admin"><Reviews /></LazyRoute>} />
          <Route path="/reviews/forms/:id" element={<LazyRoute gate="admin"><ReviewFormBuilder /></LazyRoute>} />
          <Route path="/reviews/submissions/:id" element={<LazyRoute gate="admin"><ReviewDetail /></LazyRoute>} />
          <Route path="/email-templates" element={<LazyRoute gate="admin"><EmailTemplates /></LazyRoute>} />
          <Route path="/tiers" element={<LazyRoute gate="admin" product="loyalty"><Tiers /></LazyRoute>} />
          <Route path="/benefits" element={<LazyRoute gate="admin" product="loyalty"><Benefits /></LazyRoute>} />
          <Route path="/properties" element={<LazyRoute gate="admin"><Properties /></LazyRoute>} />
          {/* Guests + CRM Reservations consolidated — redirect list pages
              to the unified ones, but keep deep-link detail routes alive. */}
          <Route path="/guests" element={<Navigate to="/members" replace />} />
          <Route path="/guests/:id" element={<LazyRoute><GuestDetail /></LazyRoute>} />
          <Route path="/inquiries" element={<LazyRoute><Inquiries /></LazyRoute>} />
          <Route path="/reservations" element={<Navigate to="/bookings" replace />} />
          <Route path="/corporate" element={<LazyRoute gate="admin"><Corporate /></LazyRoute>} />
          <Route path="/planner" element={<LazyRoute><Planner /></LazyRoute>} />
          <Route path="/venues" element={<LazyRoute gate="admin"><Venues /></LazyRoute>} />
          <Route path="/bookings" element={<LazyRoute product="booking"><Bookings /></LazyRoute>} />
          <Route path="/booking-rooms" element={<LazyRoute gate="admin" product="booking"><BookingRooms /></LazyRoute>} />
          <Route path="/booking-extras" element={<LazyRoute gate="admin" product="booking"><BookingExtras /></LazyRoute>} />
          <Route path="/bookings/calendar" element={<LazyRoute product="booking"><BookingCalendar /></LazyRoute>} />
          <Route path="/bookings/payments" element={<LazyRoute product="booking"><BookingPayments /></LazyRoute>} />
          {/* Submissions log still routable from inside Bookings page header. */}
          <Route path="/bookings/submissions" element={<LazyRoute gate="admin" product="booking"><BookingSubmissions /></LazyRoute>} />
          <Route path="/bookings/:id" element={<LazyRoute product="booking"><BookingDetail /></LazyRoute>} />
          <Route path="/services"                  element={<LazyRoute gate="admin" product="booking"><Services /></LazyRoute>} />
          <Route path="/service-masters"           element={<LazyRoute gate="admin" product="booking"><ServiceMasters /></LazyRoute>} />
          <Route path="/service-extras"            element={<LazyRoute gate="admin" product="booking"><ServiceExtras /></LazyRoute>} />
          <Route path="/service-bookings"          element={<LazyRoute product="booking"><ServiceBookings /></LazyRoute>} />
          <Route path="/service-bookings/calendar" element={<LazyRoute product="booking"><ServiceBookingCalendar /></LazyRoute>} />
          <Route path="/billing" element={<LazyRoute gate="admin"><Billing /></LazyRoute>} />
          <Route path="/audit-log" element={<LazyRoute gate="admin"><AuditLog /></LazyRoute>} />
          <Route path="/settings" element={<LazyRoute gate="admin"><Settings /></LazyRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Suspense fallback={null}><AiChat /></Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
