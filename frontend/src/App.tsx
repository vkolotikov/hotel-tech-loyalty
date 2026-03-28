import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { queryClient } from './lib/queryClient'
import { useAuthStore } from './stores/authStore'
import { APP_BASE } from './lib/api'
import { Layout } from './components/Layout'
import { useTheme } from './hooks/useTheme'

// Eager: Login (entry point) + Dashboard (most visited)
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'

// Lazy-loaded pages
const Members = lazy(() => import('./pages/Members').then(m => ({ default: m.Members })))
const MemberDetail = lazy(() => import('./pages/MemberDetail').then(m => ({ default: m.MemberDetail })))
const Scan = lazy(() => import('./pages/Scan').then(m => ({ default: m.Scan })))
const Analytics = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })))
const Offers = lazy(() => import('./pages/Offers').then(m => ({ default: m.Offers })))
const AiInsights = lazy(() => import('./pages/AiInsights').then(m => ({ default: m.AiInsights })))
const Notifications = lazy(() => import('./pages/Notifications').then(m => ({ default: m.Notifications })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const Benefits = lazy(() => import('./pages/Benefits').then(m => ({ default: m.Benefits })))
const Properties = lazy(() => import('./pages/Properties').then(m => ({ default: m.Properties })))
const Tiers = lazy(() => import('./pages/Tiers').then(m => ({ default: m.Tiers })))
const Guests = lazy(() => import('./pages/Guests').then(m => ({ default: m.Guests })))
const Inquiries = lazy(() => import('./pages/Inquiries').then(m => ({ default: m.Inquiries })))
const Reservations = lazy(() => import('./pages/Reservations').then(m => ({ default: m.Reservations })))
const Corporate = lazy(() => import('./pages/Corporate').then(m => ({ default: m.Corporate })))
const Planner = lazy(() => import('./pages/Planner').then(m => ({ default: m.Planner })))
const Venues = lazy(() => import('./pages/Venues').then(m => ({ default: m.Venues })))
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
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
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
          <Route path="/offers" element={<LazyRoute><Offers /></LazyRoute>} />
          <Route path="/analytics" element={<LazyRoute><Analytics /></LazyRoute>} />
          <Route path="/ai" element={<LazyRoute><AiInsights /></LazyRoute>} />
          <Route path="/notifications" element={<LazyRoute><Notifications /></LazyRoute>} />
          <Route path="/tiers" element={<LazyRoute><Tiers /></LazyRoute>} />
          <Route path="/benefits" element={<LazyRoute><Benefits /></LazyRoute>} />
          <Route path="/properties" element={<LazyRoute><Properties /></LazyRoute>} />
          <Route path="/guests" element={<LazyRoute><Guests /></LazyRoute>} />
          <Route path="/inquiries" element={<LazyRoute><Inquiries /></LazyRoute>} />
          <Route path="/reservations" element={<LazyRoute><Reservations /></LazyRoute>} />
          <Route path="/corporate" element={<LazyRoute><Corporate /></LazyRoute>} />
          <Route path="/planner" element={<LazyRoute><Planner /></LazyRoute>} />
          <Route path="/venues" element={<LazyRoute><Venues /></LazyRoute>} />
          <Route path="/settings" element={<LazyRoute><Settings /></LazyRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Suspense fallback={null}><AiChat /></Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
