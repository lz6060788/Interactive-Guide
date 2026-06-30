import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AtlasEditorPage } from './pages/AtlasEditorPage'
import { CatalogEditorPage } from './pages/CatalogEditorPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects/rocket/atlas-editor" replace />} />
        <Route path="/projects/:projectId/atlas-editor" element={<AtlasEditorPage />} />
        <Route path="/projects/:projectId/catalog-editor" element={<CatalogEditorPage />} />
      </Routes>
    </BrowserRouter>
  )
}