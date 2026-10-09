import { Navigate, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import DesignSystem from './pages/DesignSystem'
import VideoPage from './pages/VideoPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/video/:id" element={<VideoPage key="owner" mode="owner" />} />
      <Route path="/v/:token" element={<VideoPage key="client" mode="client" />} />
      <Route path="/design-system" element={<DesignSystem />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
