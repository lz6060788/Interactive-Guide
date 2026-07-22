import { Button, HStack, Text } from '@chakra-ui/react'

export function ContentLocaleSwitcher({
  locale,
  supportedLocales,
  availableLocales = supportedLocales,
  onChange,
  onEnableLocale,
}: {
  locale: string
  supportedLocales: string[]
  availableLocales?: readonly string[]
  onChange: (locale: string) => void
  onEnableLocale?: (locale: string) => void
}): JSX.Element {
  const locales = Array.from(new Set([...supportedLocales, ...availableLocales]))

  return (
    <HStack gap="1" px="2" data-testid="content-locale-switcher">
      <Text fontSize="11px" color="ink.muted">
        内容语言
      </Text>
      {locales.map(value => {
        const enabled = supportedLocales.includes(value)
        const label = value === 'zh-CN' ? '中文' : value === 'en-US' ? 'English' : value
        return (
          <Button
            key={value}
            size="sm"
            variant={locale === value ? 'brand' : 'ghost'}
            opacity={enabled ? '1' : '0.72'}
            aria-label={enabled ? label : `启用 ${label}`}
            onClick={() => {
              if (!enabled) onEnableLocale?.(value)
              onChange(value)
            }}
          >
            {enabled ? label : `+ ${label}`}
          </Button>
        )
      })}
    </HStack>
  )
}
