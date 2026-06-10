import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Box, Button, Flex, Heading, HStack, Spinner, Text } from '@chakra-ui/react'
import { ArrowLeft } from 'lucide-react'
import * as api from '../services/api'
import type { KnowledgePackage } from '../../../shared/types'
import type { PanoramaEditorDocument } from '../../../shared/panorama-types'
import { PanoramaEditorPage } from '../panorama-editor/PanoramaEditorPage'
import { buildPanoramaEditorDocumentFromGuide } from '../panorama-editor/buildPanoramaEditorDocument'
import { PanoramaRuntimePreviewModal } from '../panorama-editor/PanoramaRuntimePreviewModal'

interface PanoramaPackagePayload {
  bundleId: string
  guideId: string
  productId: string
  version: string
  generatedAt: string
  entryUrl: string
  bundleUrl: string
  productUrl: string
}

export function PanoramaEditorWorkbenchPage() {
  const { guideId } = useParams<{ guideId: string }>()
  const navigate = useNavigate()
  const [pkg, setPkg] = useState<KnowledgePackage | null>(null)
  const [document, setDocument] = useState<PanoramaEditorDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [packaging, setPackaging] = useState(false)
  const [lastSavedLabel, setLastSavedLabel] = useState<string | null>(null)
  const [saveFeedbackLabel, setSaveFeedbackLabel] = useState<string | null>(null)
  const [saveFeedbackTone, setSaveFeedbackTone] = useState<'success' | 'error'>('success')
  const [packageFeedbackLabel, setPackageFeedbackLabel] = useState<string | null>(null)
  const [packageFeedbackTone, setPackageFeedbackTone] = useState<'success' | 'error' | 'info'>('info')
  const [previewDocument, setPreviewDocument] = useState<PanoramaEditorDocument | null>(null)

  const load = useCallback(async () => {
    if (!guideId) return
    try {
      setLoading(true)
      const data = await api.fetchGuide(`${guideId}?t=${Date.now()}`) as KnowledgePackage
      setPkg(data)
      setDocument(buildPanoramaEditorDocumentFromGuide(data))
      setLastSavedLabel(data.metadata?.updatedAt ? `最近保存 ${new Date(data.metadata.updatedAt).toLocaleString()}` : null)
      setLoadError(null)
    } catch (nextError) {
      setLoadError(nextError instanceof Error ? nextError.message : '加载全景编辑器失败')
    } finally {
      setLoading(false)
    }
  }, [guideId])

  useEffect(() => {
    load()
  }, [load])

  const heading = useMemo(() => {
    if (!pkg) return '独立全景编辑器'
    return `${pkg.title} / 独立全景编辑器`
  }, [pkg])

  const handleSave = useCallback(async (nextDocument: PanoramaEditorDocument) => {
    if (!guideId || !pkg) return
    try {
      setSaving(true)
      const nextPackage: Partial<KnowledgePackage> = {
        panoramaEditorDocument: nextDocument,
      }
      const updated = await api.updateGuide(guideId, nextPackage) as KnowledgePackage
      setPkg(updated)
      setDocument(buildPanoramaEditorDocumentFromGuide(updated))
      setLastSavedLabel(updated.metadata?.updatedAt ? `最近保存 ${new Date(updated.metadata.updatedAt).toLocaleString()}` : '已保存')
      setSaveFeedbackTone('success')
      setSaveFeedbackLabel('保存成功')
    } catch (nextError) {
      setSaveFeedbackTone('error')
      setSaveFeedbackLabel(nextError instanceof Error ? nextError.message : '保存全景编辑器失败')
    } finally {
      setSaving(false)
    }
  }, [guideId, pkg])

  const handleOpenPreview = useCallback((nextDocument: PanoramaEditorDocument) => {
    setPreviewDocument(structuredClone(nextDocument))
  }, [])

  const handlePackage = useCallback(async (nextDocument: PanoramaEditorDocument) => {
    if (!guideId || !pkg) return
    try {
      setPackaging(true)
      setPackageFeedbackTone('info')
      setPackageFeedbackLabel('正在保存并打包独立产物')

      const updated = await api.updateGuide(guideId, {
        panoramaEditorDocument: nextDocument,
      }) as KnowledgePackage

      setPkg(updated)
      setDocument(buildPanoramaEditorDocumentFromGuide(updated))
      setLastSavedLabel(updated.metadata?.updatedAt ? `最近保存 ${new Date(updated.metadata.updatedAt).toLocaleString()}` : '已保存')
      setSaveFeedbackTone('success')
      setSaveFeedbackLabel('保存成功')

      const bundle = await api.packagePanoramaGuide(guideId) as PanoramaPackagePayload
      setPackageFeedbackTone('success')
      setPackageFeedbackLabel(`打包完成 ${new Date(bundle.generatedAt).toLocaleTimeString()}`)

      const entryUrl = new URL(bundle.entryUrl, window.location.origin).toString()
      window.open(entryUrl, '_blank', 'noopener,noreferrer')
    } catch (nextError) {
      setPackageFeedbackTone('error')
      setPackageFeedbackLabel(nextError instanceof Error ? nextError.message : '独立打包失败')
    } finally {
      setPackaging(false)
    }
  }, [guideId, pkg])

  if (loading) {
    return (
      <Flex h="100vh" align="center" justify="center" bg="base">
        <Spinner color="brand" />
      </Flex>
    )
  }

  if (loadError || !document) {
    return (
      <Flex direction="column" h="100vh" bg="base">
        <Flex
          align="center"
          gap="4"
          px="5"
          py="3"
          borderBottom="1px solid"
          borderColor="border-default"
          bg="surface"
          flexShrink={0}
        >
          <Button
            variant="ghost"
            size="sm"
            color="text-secondary"
            _hover={{ color: 'text-primary', bg: 'surface-raised' }}
            onClick={() => navigate(`/guides/${guideId}`)}
          >
            <ArrowLeft size={16} style={{ marginRight: 4 }} />
            返回工作台
          </Button>
          <Heading size="sm" fontWeight="600" color="text-primary" flex="1">
            独立全景编辑器
          </Heading>
          <Button
            size="sm"
            variant="outline"
            bg="surface-raised"
            color="text-primary"
            borderColor="border-default"
            _hover={{ bg: 'surface-overlay' }}
            onClick={load}
          >
            重试
          </Button>
        </Flex>
        <Flex flex="1" align="center" justify="center">
          <Text color="error">{loadError ?? '无法初始化全景编辑器'}</Text>
        </Flex>
      </Flex>
    )
  }

  return (
    <Flex direction="column" h="100vh" bg="base">
      <Flex
        align="center"
        gap="4"
        px="5"
        py="3"
        borderBottom="1px solid"
        borderColor="border-default"
        bg="rgba(18, 19, 26, 0.94)"
        backdropFilter="blur(14px)"
        flexShrink={0}
      >
        <Button
          variant="ghost"
          size="sm"
          color="text-secondary"
          _hover={{ color: 'text-primary', bg: 'surface-raised' }}
          onClick={() => navigate(`/guides/${guideId}`)}
        >
          <ArrowLeft size={16} style={{ marginRight: 4 }} />
          返回工作台
        </Button>
        <Heading size="sm" fontWeight="600" color="text-primary" flex="1">
          {heading}
        </Heading>
        <HStack gap="2">
          <Badge bg="info-subtle" color="info" px="2" py="1" rounded="sm">
            管理端入口
          </Badge>
          <Badge bg="brand-subtle" color="brand" px="2" py="1" rounded="sm">
            本地持久化
          </Badge>
        </HStack>
      </Flex>
      <Box flex="1" overflow="auto" p="5" pt="4" bg="base">
        <PanoramaEditorPage
          document={document}
          saving={saving}
          packaging={packaging}
          lastSavedLabel={lastSavedLabel}
          saveFeedbackLabel={saveFeedbackLabel}
          saveFeedbackTone={saveFeedbackTone}
          packageFeedbackLabel={packageFeedbackLabel}
          packageFeedbackTone={packageFeedbackTone}
          onSave={handleSave}
          onPreview={handleOpenPreview}
          onPackage={handlePackage}
        />
      </Box>
      {previewDocument ? (
        <PanoramaRuntimePreviewModal
          document={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </Flex>
  )
}
