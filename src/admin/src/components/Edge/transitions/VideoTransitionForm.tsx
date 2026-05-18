import { useState } from 'react'
import { Box, Text, Button, Flex } from '@chakra-ui/react'
import { Upload } from 'lucide-react'
import { uploadEdgeVideo } from '../../../../services/api'

const BORDER = '#2a2d3a'

interface Props {
  guideId: string
  edgeId: string
  videoUrl: string | undefined
  onChange: (videoUrl: string) => void
  disabled?: boolean
}

export function VideoTransitionForm({ guideId, edgeId, videoUrl, onChange, disabled }: Props) {
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)

  return (
    <Box>
      <Text fontSize="xs" color="text-tertiary" mb="2">
        当前视频
      </Text>

      {videoUrl ? (
        <Box rounded="md" overflow="hidden" mb="3" style={{ border: `1px solid ${BORDER}` }}>
          <video
            src={videoUrl}
            controls
            muted
            playsInline
            style={{
              width: '100%',
              display: 'block',
              background: '#05060a',
              maxHeight: '200px',
              objectFit: 'contain',
            }}
          />
        </Box>
      ) : (
        <Flex
          align="center"
          justify="center"
          mb="3"
          p="6"
          rounded="md"
          bg="rgba(92,95,119,0.08)"
          style={{ border: `1px dashed ${BORDER}` }}
        >
          <Text fontSize="xs" color="text-tertiary">
            暂未设置视频
          </Text>
        </Flex>
      )}

      <input
        type="file"
        accept="video/*"
        id={`video-upload-${edgeId}`}
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setUploading(true)
          setUploadMsg(null)
          try {
            const result = await uploadEdgeVideo(guideId, edgeId, file)
            onChange(result.videoUrl)
            setUploadMsg('视频上传成功')
            setTimeout(() => setUploadMsg(null), 3000)
          } catch (err: any) {
            setUploadMsg(err.message || '上传失败')
          } finally {
            setUploading(false)
            e.target.value = ''
          }
        }}
      />

      <Button
        w="100%"
        size="sm"
        variant="ghost"
        color="text-secondary"
        _hover={{ bg: 'surface-raised' }}
        loading={uploading}
        disabled={disabled}
        onClick={() => document.getElementById(`video-upload-${edgeId}`)?.click()}
      >
        <Upload size={14} style={{ marginRight: 6 }} />
        {videoUrl ? '上传视频替换' : '上传视频'}
      </Button>

      {uploadMsg && (
        <Text fontSize="xs" color={uploadMsg.includes('成功') ? '#22c55e' : '#ef4444'} mt="2" px="1">
          {uploadMsg}
        </Text>
      )}
    </Box>
  )
}