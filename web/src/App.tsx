import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/authContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MetaCallback from './pages/MetaCallback'
import NewLaunch from './pages/NewLaunch'
import LaunchDetail from './pages/LaunchDetail'
import Account from './pages/Account'
import { DataDeletion, Guide, Privacy, Terms } from './pages/Legal'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <p className="center">Loading...</p>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/data-deletion" element={<DataDeletion />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/meta/callback" element={<RequireAuth><MetaCallback /></RequireAuth>} />
      <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
      <Route path="/launch/new" element={<RequireAuth><NewLaunch /></RequireAuth>} />
      <Route path="/launch/:id" element={<RequireAuth><LaunchDetail /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
