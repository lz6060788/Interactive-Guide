import { Badge, Box, Button, Flex, Heading, HStack, Stack, Text } from '@chakra-ui/react'
import { ChevronDown, ChevronUp, FolderTree, Plus, Trash2 } from 'lucide-react'
import type { PanoramaSection } from '../../../shared/panorama-types'
import { isPanoramaGroup } from '../../../shared/panorama-types'

interface PanoramaStructurePanelProps {
  sections: PanoramaSection[]
  activeSectionId?: string
  activeGroupId?: string
  activeItemId?: string
  onAddSection: () => void
  onDeleteSection: (sectionId: string) => void
  onMoveSection: (sectionId: string, direction: -1 | 1) => void
  onAddGroup: (sectionId: string) => void
  onDeleteGroup: (sectionId: string, groupId: string) => void
  onMoveGroup: (sectionId: string, groupId: string, direction: -1 | 1) => void
  onAddItem: (sectionId: string, groupId: string) => void
  onDeleteItem: (sectionId: string, groupId: string, itemId: string) => void
  onMoveItem: (sectionId: string, groupId: string, itemId: string, direction: -1 | 1) => void
  onSelectSection: (sectionId: string) => void
  onSelectGroup: (sectionId: string, groupId: string) => void
  onSelectItem: (sectionId: string, groupId: string, itemId: string) => void
}

export function PanoramaStructurePanel({
  sections,
  activeSectionId,
  activeGroupId,
  activeItemId,
  onAddSection,
  onDeleteSection,
  onMoveSection,
  onAddGroup,
  onDeleteGroup,
  onMoveGroup,
  onAddItem,
  onDeleteItem,
  onMoveItem,
  onSelectSection,
  onSelectGroup,
  onSelectItem,
}: PanoramaStructurePanelProps) {
  const actionButtonProps = {
    size: 'xs' as const,
    variant: 'ghost' as const,
    color: 'text-secondary',
    _hover: { bg: 'surface-overlay', color: 'text-primary' },
  }

  return (
    <Box
      w="328px"
      bg="surface"
      borderRadius="xl"
      p="4"
      overflowY="auto"
      border="1px solid"
      borderColor="border-default"
      boxShadow="md"
    >
      <Flex justify="space-between" align="center" mb="4" gap="2">
        <Flex gap="3" align="center">
          <Flex
            w="34px"
            h="34px"
            borderRadius="lg"
            bg="rgba(255,255,255,0.04)"
            border="1px solid"
            borderColor="border-subtle"
            color="text-secondary"
            align="center"
            justify="center"
          >
            <FolderTree size={16} />
          </Flex>
          <Box>
            <Heading size="sm" color="text-primary">结构区</Heading>
            <Text fontSize="xs" color="text-tertiary" mt="1">按一级 / 二级 / 三级维护场景结构</Text>
          </Box>
        </Flex>
        <Box textAlign="right">
          <Text fontSize="xs" color="text-tertiary">总计</Text>
          <Text fontSize="sm" color="text-primary" fontWeight="700">{sections.length} 个一级</Text>
        </Box>
      </Flex>
      <Button
        size="sm"
        w="full"
        mb="4"
        bg="brand-subtle"
        color="brand"
        border="1px solid"
        borderColor="rgba(99, 102, 241, 0.28)"
        _hover={{ bg: 'rgba(99, 102, 241, 0.2)' }}
        onClick={onAddSection}
      >
        <Plus size={14} style={{ marginRight: 6 }} />
        新增一级
      </Button>
      <Stack gap="4">
        {sections.map((section, sectionIndex) => (
          <Box
            key={section.id}
            border="1px solid"
            borderColor={section.id === activeSectionId ? 'rgba(99, 102, 241, 0.4)' : 'border-default'}
            borderRadius="lg"
            p="3"
            bg={section.id === activeSectionId ? 'rgba(99, 102, 241, 0.08)' : 'surface-raised'}
          >
            <Stack flex="1" gap="2">
              <Flex gap="2" align="center">
                <Button
                  size="sm"
                  bg={section.id === activeSectionId ? 'rgba(99, 102, 241, 0.18)' : 'transparent'}
                  color={section.id === activeSectionId ? 'text-primary' : 'text-secondary'}
                  border="1px solid"
                  borderColor={section.id === activeSectionId ? 'rgba(99, 102, 241, 0.32)' : 'transparent'}
                  _hover={{ bg: 'surface-overlay', color: 'text-primary' }}
                  flex="1"
                  minW="0"
                  justifyContent="flex-start"
                  h="42px"
                  px="3"
                  onClick={() => onSelectSection(section.id)}
                >
                  <Text fontWeight="700" textAlign="left" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                    {section.label}
                  </Text>
                </Button>
                <HStack gap="1" flexShrink={0}>
                <Button {...actionButtonProps} onClick={() => onMoveSection(section.id, -1)} isDisabled={sectionIndex === 0}>
                  <ChevronUp size={14} />
                </Button>
                <Button {...actionButtonProps} onClick={() => onMoveSection(section.id, 1)} isDisabled={sectionIndex === sections.length - 1}>
                  <ChevronDown size={14} />
                </Button>
                <Button {...actionButtonProps} onClick={() => onAddGroup(section.id)}>
                  <Plus size={14} />
                </Button>
                <Button {...actionButtonProps} color="error" _hover={{ bg: 'error-subtle', color: 'error' }} onClick={() => onDeleteSection(section.id)} isDisabled={sections.length <= 1}>
                  <Trash2 size={14} />
                </Button>
                </HStack>
              </Flex>
            </Stack>
            <Stack mt="3" gap="2">
              {section.groups.map((group, groupIndex) => (
                <Box key={group.id} pl="2" position="relative">
                  <Box
                    position="absolute"
                    left="7px"
                    top="0"
                    bottom="0"
                    w="1px"
                    bg="rgba(255,255,255,0.06)"
                  />
                  <Stack gap="1.5" position="relative">
                    <Flex gap="2" align="center" position="relative">
                      <Button
                        size="xs"
                        bg={group.id === activeGroupId ? 'surface-overlay' : 'transparent'}
                        color={group.id === activeGroupId ? 'text-primary' : 'text-secondary'}
                        border="1px solid"
                        borderColor={group.id === activeGroupId ? 'border-default' : 'transparent'}
                        _hover={{ bg: 'surface-overlay', color: 'text-primary' }}
                        flex="1"
                        minW="0"
                        justifyContent="flex-start"
                        h="38px"
                        px="3"
                        onClick={() => onSelectGroup(section.id, group.id)}
                      >
                        <Text
                          textAlign="left"
                          whiteSpace="nowrap"
                          overflow="hidden"
                          textOverflow="ellipsis"
                        >
                          {group.title}
                        </Text>
                      </Button>
                      <HStack gap="1" flexShrink={0}>
                      <Button {...actionButtonProps} onClick={() => onMoveGroup(section.id, group.id, -1)} isDisabled={groupIndex === 0}>
                        <ChevronUp size={14} />
                      </Button>
                      <Button {...actionButtonProps} onClick={() => onMoveGroup(section.id, group.id, 1)} isDisabled={groupIndex === section.groups.length - 1}>
                        <ChevronDown size={14} />
                      </Button>
                      {isPanoramaGroup(group) ? (
                        <Button {...actionButtonProps} onClick={() => onAddItem(section.id, group.id)}>
                          <Plus size={14} />
                        </Button>
                      ) : null}
                      <Button {...actionButtonProps} color="error" _hover={{ bg: 'error-subtle', color: 'error' }} onClick={() => onDeleteGroup(section.id, group.id)} isDisabled={section.groups.length <= 1}>
                        <Trash2 size={14} />
                      </Button>
                      </HStack>
                    </Flex>
                  </Stack>
                  {isPanoramaGroup(group) ? (
                    <Stack mt="2" gap="1">
                      {group.items.map((item, itemIndex) => (
                      <Flex
                        key={item.id}
                        gap="2"
                        align="center"
                        p="1.5"
                        pl="7"
                        borderRadius="md"
                        bg={item.id === activeItemId ? 'rgba(255,255,255,0.04)' : 'transparent'}
                        position="relative"
                      >
                        <Box
                          position="absolute"
                          left="14px"
                          top="50%"
                          w="10px"
                          h="1px"
                          bg="rgba(255,255,255,0.08)"
                          transform="translateY(-50%)"
                        />
                        <Button
                          size="xs"
                          bg={item.id === activeItemId ? 'brand' : 'transparent'}
                          color={item.id === activeItemId ? 'white' : 'text-secondary'}
                          _hover={{ bg: item.id === activeItemId ? 'brand-hover' : 'surface-overlay', color: 'text-primary' }}
                          flex="1"
                          justifyContent="flex-start"
                          minW="0"
                          h="32px"
                          onClick={() => onSelectItem(section.id, group.id, item.id)}
                        >
                          <Text truncate fontSize="xs">{item.title}</Text>
                        </Button>
                        <HStack gap="1">
                          <Button {...actionButtonProps} onClick={() => onMoveItem(section.id, group.id, item.id, -1)} isDisabled={itemIndex === 0}>
                            <ChevronUp size={14} />
                          </Button>
                          <Button {...actionButtonProps} onClick={() => onMoveItem(section.id, group.id, item.id, 1)} isDisabled={itemIndex === group.items.length - 1}>
                            <ChevronDown size={14} />
                          </Button>
                          <Button {...actionButtonProps} color="error" _hover={{ bg: 'error-subtle', color: 'error' }} onClick={() => onDeleteItem(section.id, group.id, item.id)} isDisabled={group.items.length <= 1}>
                            <Trash2 size={14} />
                          </Button>
                        </HStack>
                      </Flex>
                      ))}
                    </Stack>
                  ) : (
                    <Flex mt="2" pl="7" align="center" gap="2">
                      <Badge bg="info-subtle" color="info">HTML</Badge>
                      <Text fontSize="xs" color="text-tertiary">该二级项为 HTML 视图，无三级结构</Text>
                    </Flex>
                  )}
                </Box>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}
