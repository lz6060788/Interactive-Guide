import { Button, HStack, Text } from '@chakra-ui/react'

export function ContentLocaleSwitcher({
  locale,
  supportedLocales,
  onChange,
}: {
  locale: string
  supportedLocales: string[]
  onChange: (locale: string) => void
}): JSX.Element {
  return (
    <HStack gap="1" px="2" data-testid="content-locale-switcher">
      <Text fontSize="11px" color="ink.muted">
        内容语言
      </Text>
      {supportedLocales.map(value => (
        <Button
          key={value}
          size="sm"
          variant={locale === value ? 'brand' : 'ghost'}
          onClick={() => onChange(value)}
        >
          {value === 'zh-CN' ? '中文' : value === 'en-US' ? 'English' : value}
        </Button>
      ))}
    </HStack>
  )
}
