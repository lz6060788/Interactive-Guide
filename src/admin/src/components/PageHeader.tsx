/**
 * PageHeader / StatusFooter / TableSkeleton — shared chrome for the
 * admin workbench pages.
 *
 * Three pieces:
 *   - PageHeader: top bar with breadcrumb + actions slot
 *   - StatusFooter: bottom status bar (revision / dirty / counts / online)
 *   - TableSkeleton: loading shimmer
 *
 * Used by ProjectListPage / AtlasEditorPage / CatalogEditorPage /
 * ProjectSettingsPage so the breadcrumb separator structure is shared.
 */
import { Fragment } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Breadcrumb,
  HStack,
  Skeleton,
  Stack,
  Text,
} from '@chakra-ui/react'

// ─── PageHeader ───────────────────────────────────────────────

export interface Crumb {
  label: string
  to?: string
}

interface PageHeaderProps {
  crumbs: Crumb[]
  actions?: React.ReactNode
}

export function PageHeader({ crumbs, actions }: PageHeaderProps): JSX.Element {
  return (
    <Box
      as="header"
      className="ui-chrome"
      h="14"
      px="6"
      bg="bg.raised"
      borderBottomWidth="1px"
      borderColor="border"
      flexShrink="0"
      display="flex"
      alignItems="center"
      justifyContent="space-between"
    >
      <Breadcrumb.Root>
        <Breadcrumb.List gap="1.5" fontSize="14px">
          {crumbs.map((c, i) => (
            <Fragment key={`${c.label}-${i}`}>
              <Breadcrumb.Item>
                {c.to ? (
                  <Breadcrumb.Link asChild color="ink.muted">
                    <RouterLink to={c.to}>{c.label}</RouterLink>
                  </Breadcrumb.Link>
                ) : (
                  <Breadcrumb.CurrentLink color="ink" fontWeight="500">
                    {c.label}
                  </Breadcrumb.CurrentLink>
                )}
              </Breadcrumb.Item>
              {i < crumbs.length - 1 && <Breadcrumb.Separator />}
            </Fragment>
          ))}
        </Breadcrumb.List>
      </Breadcrumb.Root>
      {actions && <HStack gap="2">{actions}</HStack>}
    </Box>
  )
}

// ─── StatusFooter ─────────────────────────────────────────────

interface StatusFooterProps {
  revision: number
  isDirty: boolean
  lastSavedAt?: string | null
  stats?: { stages: number; categories: number; items: number }
  backendOk?: boolean
  leftExtras?: React.ReactNode
  rightExtras?: React.ReactNode
}

export function StatusFooter({
  revision,
  isDirty,
  lastSavedAt,
  stats,
  backendOk = true,
  leftExtras,
  rightExtras,
}: StatusFooterProps): JSX.Element {
  return (
    <Box
      as="footer"
      className="ui-chrome"
      fontFamily="mono"
      h="6"
      px="4"
      bg="bg.sunken"
      borderTopWidth="1px"
      borderColor="border"
      fontSize="11px"
      color="ink.muted"
      letterSpacing="0.02em"
      flexShrink="0"
      display="flex"
      alignItems="center"
      justifyContent="space-between"
    >
      <HStack gap="2.5">
        <Text>rev {revision}</Text>
        <Sep />
        <Text color={isDirty ? 'state.warn' : undefined}>
          {isDirty ? 'unsaved' : `saved ${fmtTime(lastSavedAt)}`}
        </Text>
        {stats && (
          <>
            <Sep />
            <Text>{stats.stages} stages</Text>
            <Sep />
            <Text>{stats.categories} cats</Text>
            <Sep />
            <Text>{stats.items} items</Text>
          </>
        )}
        {leftExtras}
      </HStack>
      <HStack gap="2.5">
        <Text color={backendOk ? 'state.ok' : 'state.error'}>
          {backendOk ? '⌥ online' : '⌥ offline'}
        </Text>
        {rightExtras}
      </HStack>
    </Box>
  )
}

// ─── TableSkeleton ────────────────────────────────────────────

export function TableSkeleton({ rows = 6 }: { rows?: number }): JSX.Element {
  return (
    <Stack gap="0.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          h="48px"
          borderRadius="sm"
          className="mono"
        />
      ))}
    </Stack>
  )
}

// ─── Helpers ──────────────────────────────────────────────────

export function Sep(): JSX.Element {
  return <Text as="span" color="border">·</Text>
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}