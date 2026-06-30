import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PackageListPage } from './pages/PackageListPage'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { GenerateHistoryPage } from './pages/GenerateHistoryPage'
import { PanoramaEditorWorkbenchPage } from './pages/PanoramaEditorWorkbenchPage'
import { AtlasEditorPage } from './pages/AtlasEditorPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/guides" replace />} />
        <Route path="/guides" element={<PackageListPage />} />
        <Route path="/guides/:guideId" element={<WorkbenchPage />} />
        <Route path="/guides/:guideId/panorama-editor" element={<PanoramaEditorWorkbenchPage />} />
        <Route path="/projects/:projectId/atlas-editor" element={<AtlasEditorPage />} />
        <Route path="/generates" element={<GenerateHistoryPage />} />
      </Routes>
    </BrowserRouter>
  )
}
