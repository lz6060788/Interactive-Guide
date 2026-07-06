/**
 * Top-level ErrorBoundary.
 *
 * Catches render errors anywhere in the tree and renders a recoverable
 * fallback. Per-feature boundaries can be added later for more granular
 * recovery, but one global boundary is the safety net.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Box, Button, Heading, HStack, Stack, Text } from '@chakra-ui/react'
import { AlertTriangle, Copy, Home } from 'lucide-react'
import { Link } from 'react-router-dom'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error, info })
    console.error('[ErrorBoundary] caught:', error, info)
  }

  private async copy(): Promise<void> {
    const { error, info } = this.state
    const text = `${error?.name}: ${error?.message}\n\n${info?.componentStack ?? ''}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore
    }
  }

  private reset(): void {
    this.setState({ error: null, info: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <Box
        minH="100vh"
        bg="paper"
        color="ink"
        display="flex"
        alignItems="center"
        justifyContent="center"
        p={6}
      >
        <Stack
          maxW="520px"
          gap={5}
          bg="paper.raised"
          borderWidth="1px"
          borderColor="rule"
          borderRadius="md"
          boxShadow="sm"
          p={8}
        >
          <HStack gap={3} color="state.error">
            <AlertTriangle size={24} strokeWidth={1.75} />
            <Heading size="md" fontWeight={500}>
              页面出错了
            </Heading>
          </HStack>
          <Text color="ink.muted" fontSize="14px" lineHeight="1.55">
            渲染时发生了未捕获的错误。已记录到 console。请尝试刷新或返回首页。
          </Text>
          <Box
            fontFamily="mono"
            fontSize="12px"
            color="ink.muted"
            bg="paper.sunken"
            p={3}
            borderRadius="sm"
            borderWidth="1px"
            borderColor="rule"
            maxH="160px"
            overflow="auto"
          >
            <Text fontWeight={600} color="ink" mb={1}>
              {this.state.error.name}: {this.state.error.message}
            </Text>
            {this.state.info?.componentStack && (
              <Text as="pre" whiteSpace="pre-wrap" fontSize="11px">
                {this.state.info.componentStack.split('\n').slice(0, 8).join('\n')}
              </Text>
            )}
          </Box>
          <HStack gap={2} justify="flex-end">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => void this.copy()}
            >
              <HStack gap={1.5}>
                <Copy size={14} strokeWidth={1.75} />
                <span>复制错误</span>
              </HStack>
            </Button>
            <Link to="/" onClick={this.reset} style={{ textDecoration: 'none' }}>
              <Button as="span" variant="primary" size="md">
                <HStack gap={1.5}>
                  <Home size={14} strokeWidth={1.75} />
                  <span>返回首页</span>
                </HStack>
              </Button>
            </Link>
          </HStack>
        </Stack>
      </Box>
    )
  }
}
