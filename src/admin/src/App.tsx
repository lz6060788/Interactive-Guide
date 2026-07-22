import { Routes, Route } from 'react-router-dom'
import { ProjectListPage } from './pages/ProjectListPage'
import { AtlasEditorPage } from './pages/AtlasEditorPage'
import { CatalogEditorPage } from './pages/CatalogEditorPage'
import { ProjectSettingsPage } from './pages/ProjectSettingsPage'
import { GalleryEditorPage } from './pages/GalleryEditorPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectListPage />} />
      <Route path="/projects/:projectId/atlas-editor" element={<AtlasEditorPage />} />
      <Route path="/projects/:projectId/catalog-editor" element={<CatalogEditorPage />} />
      <Route path="/projects/:projectId/gallery-editor" element={<GalleryEditorPage />} />
      <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
    </Routes>
  )
}
