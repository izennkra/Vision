import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { cloud, hasSession } from './lib/api'
import Dashboard from './pages/Dashboard'
import DesignSystem from './pages/DesignSystem'
import Login from './pages/Login'
import Recorder from './pages/Recorder'
import VideoPage from './pages/VideoPage'

/** En ligne, les pages du propriétaire demandent la connexion. */
function Owner({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (cloud && !hasSession()) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Owner><Dashboard /></Owner>} />
      <Route path="/record" element={<Owner><Recorder /></Owner>} />
      <Route path="/video/:id" element={<Owner><VideoPage key="owner" mode="owner" /></Owner>} />
      <Route path="/v/:token" element={<VideoPage key="client" mode="client" />} />
      <Route path="/login" element={<Login />} />
      <Route path="/design-system" element={<DesignSystem />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
