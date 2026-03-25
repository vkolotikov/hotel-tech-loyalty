import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { queryClient } from './lib/queryClient'
import { useAuthStore } from './stores/authStore'
import { APP_BASE } from './lib/api'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Members } from './pages/Members'
import { Scan } from './pages/Scan'
import { Analytics } from './pages/Analytics'
import { Offers } from './pages/Offers'
import { AiInsights } from './pages/AiInsights'
import { Notifications } from './pages/Notifications'
import { MemberDetail } from './pages/MemberDetail'
import { Settings } from './pages/Settings'
import { Benefits } from './pages/Benefits'
import { Properties } from './pages/Properties'
import { Tiers } from './pages/Tiers'
import { useTheme } from './hooks/useTheme'

function ThemeLoader() {
  useTheme()
  return null
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
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
          <Route path="/scan" element={<ProtectedRoute><Scan /></ProtectedRoute>} />
          <Route path="/members" element={<ProtectedRoute><Members /></ProtectedRoute>} />
          <Route path="/members/:id" element={<ProtectedRoute><MemberDetail /></ProtectedRoute>} />
          <Route path="/offers" element={<ProtectedRoute><Offers /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/ai" element={<ProtectedRoute><AiInsights /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/tiers" element={<ProtectedRoute><Tiers /></ProtectedRoute>} />
          <Route path="/benefits" element={<ProtectedRoute><Benefits /></ProtectedRoute>} />
          <Route path="/properties" element={<ProtectedRoute><Properties /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
