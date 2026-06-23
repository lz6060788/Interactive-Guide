import { Box, Button, Text, type ButtonProps } from '@chakra-ui/react'

const BORDER = '#2a2d3a'

export function ActionButton({ active = false, ...props }: ButtonProps & { active?: boolean }) {
  return (
    <Button
      size="xs"
      variant="solid"
      color={active ? '#ffffff' : '#dbe7ff'}
      bg={active ? '#295dff' : 'rgba(82, 109, 176, 0.16)'}
      border="1px solid"
      borderColor={active ? 'rgba(96, 142, 255, 0.82)' : 'rgba(82, 109, 176, 0.26)'}
      _hover={{
        bg: active ? '#3467ff' : 'rgba(82, 109, 176, 0.24)',
      }}
      _active={{
        bg: active ? '#1f4fe8' : 'rgba(82, 109, 176, 0.28)',
      }}
      {...props}
    />
  )
}

export function ControlField({
  label,
  value,
  onChange,
  type = 'text',
  step,
  min,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  step?: string
  min?: string
}) {
  return (
    <Box mb="2.5">
      <Text fontSize="xs" color="#8ea0c4" mb="1">{label}</Text>
      <input
        type={type}
        value={value}
        step={step}
        min={min}
        onChange={event => onChange(event.target.value)}
        style={{
          width: '100%',
          background: '#090b10',
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          color: '#e4e4e7',
          fontSize: 12,
          padding: '8px 10px',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
    </Box>
  )
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <Box mb="2.5">
      <Text fontSize="xs" color="#8ea0c4" mb="1">{label}</Text>
      <textarea
        value={value}
        rows={rows}
        onChange={event => onChange(event.target.value)}
        style={{
          width: '100%',
          background: '#090b10',
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          color: '#e4e4e7',
          fontSize: 12,
          padding: '8px 10px',
          boxSizing: 'border-box',
          outline: 'none',
          resize: 'vertical',
        }}
      />
    </Box>
  )
}
