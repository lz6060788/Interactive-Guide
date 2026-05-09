import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PackageListPage } from './pages/PackageListPage'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { GenerateHistoryPage } from './pages/GenerateHistoryPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/guides" replace />} />
        <Route path="/guides" element={<PackageListPage />} />
        <Route path="/guides/:guideId" element={<WorkbenchPage />} />
        <Route path="/generates" element={<GenerateHistoryPage />} />
      </Routes>
    </BrowserRouter>
  )
}
