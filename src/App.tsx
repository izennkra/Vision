import { Navigate, Route, Routes } from 'react-router-dom'
import DesignSystem from './pages/DesignSystem'

export default function App() {
  return (
    <Routes>
      <Route path="/design-system" element={<DesignSystem />} />
      <Route path="*" element={<Navigate to="/design-system" replace />} />
    </Routes>
  )
}
