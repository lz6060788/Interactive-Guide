import { Box, Flex, Text, VStack } from '@chakra-ui/react'

const BORDER = '#2a2d3a'

export interface TransitionOption {
  type: 'video' | 'builtin'
  builtinType?: 'pan' | 'flip' | 'zoom'
  label: string
  description: string
}

const TRANSITION_OPTIONS: TransitionOption[] = [
  {
    type: 'video',
    label: '视频转场',
    description: '使用 AI 生成的视频作为转场效果',
  },
  {
    type: 'builtin',
    builtinType: 'pan',
    label: '平移切换',
    description: '当前节点向指定方向移出，目标节点从视口外移入',
  },
  {
    type: 'builtin',
    builtinType: 'flip',
    label: '翻页切换',
    description: '3D 翻页效果，可选水平/垂直方向',
  },
  {
    type: 'builtin',
    builtinType: 'zoom',
    label: '缩放切换',
    description: '以热点位置为中心进行缩放，淡入目标节点',
  },
]

interface Props {
  value: TransitionOption | null
  onChange: (option: TransitionOption) => void
  disabled?: boolean
}

export function TransitionSelector({ value, onChange, disabled }: Props) {
  const isSelected = (opt: TransitionOption) => {
    if (!value) return false
    if (value.type !== opt.type) return false
    if (opt.type === 'builtin' && value.builtinType !== opt.builtinType) return false
    return true
  }

  return (
    <VStack align="stretch" gap="2">
      <Text fontSize="xs" fontWeight="500" color="text-tertiary" mb="1">
        转场类型
      </Text>
      {TRANSITION_OPTIONS.map((opt) => {
        const selected = isSelected(opt)
        return (
          <Box
            key={`${opt.type}-${opt.builtinType || ''}`}
            as="button"
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt)}
            textAlign="left"
            p="3"
            rounded="md"
            bg={selected ? 'rgba(59,130,246,0.12)' : 'rgba(92,95,119,0.08)'}
            border="1px solid"
            borderColor={selected ? 'rgba(59,130,246,0.5)' : BORDER}
            cursor={disabled ? 'not-allowed' : 'pointer'}
            opacity={disabled ? 0.5 : 1}
            transition="all 150ms ease"
            _hover={
              disabled
                ? {}
                : {
                    borderColor: selected ? 'rgba(59,130,246,0.7)' : 'rgba(92,95,119,0.3)',
                    bg: selected ? 'rgba(59,130,246,0.16)' : 'rgba(92,95,119,0.12)',
                  }
            }
          >
            <Flex justify="space-between" align="center">
              <Box>
                <Text fontSize="sm" fontWeight="500" color={selected ? '#7dd3fc' : 'text-primary'}>
                  {opt.label}
                </Text>
                <Text fontSize="xs" color="text-tertiary" mt="0.5">
                  {opt.description}
                </Text>
              </Box>
              {selected && (
                <Box
                  w="16px"
                  h="16px"
                  rounded="full"
                  bg="#3b82f6"
                  color="white"
                  fontSize="10px"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  ✓
                </Box>
              )}
            </Flex>
          </Box>
        )
      })}
    </VStack>
  )
}