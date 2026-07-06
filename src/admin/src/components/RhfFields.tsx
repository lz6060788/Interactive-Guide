/**
 * RHF + Chakra Field adapters.
 *
 * The admin editor's right-rail inspectors (AtlasInspector,
 * CatalogInspector) use `react-hook-form` with ~30 `Controller` blocks
 * each. The local `TextField` / `NumberField` / `SelectField` /
 * `ToggleField` primitives that this directory used to host had a
 * `value | onChange(value)` shape that matched RHF's `field` object
 * directly. Chakra's native `Input` / `NumberInput` / `NativeSelect` /
 * `Switch` use raw DOM event shapes instead.
 *
 * These four components absorb the shape mismatch so the call sites
 * stay one line each:
 *
 *   <RhfTextField control={control} name="title" label="标题" />
 *   <RhfNumberField control={control} name="x" min={0} max={1} step={0.01} unit="×" />
 *   <RhfSelectField control={control} name="kind" options={kinds} />
 *   <RhfSwitchRow control={control} name="enabled" label="启用" />
 *
 * They are the *only* file in this directory that survives the Phase 3
 * delete; the other primitives are replaced by direct Chakra usage.
 */
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'
import {
  Box,
  Field,
  HStack,
  Input,
  NativeSelect,
  NumberInput,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'

interface RhfCommon<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label?: string
  hint?: string
  required?: boolean
}

export function RhfTextField<T extends FieldValues>(
  props: RhfCommon<T> & {
    placeholder?: string
    monospace?: boolean
    type?: 'text' | 'email' | 'url'
  },
): JSX.Element {
  const { control, name, label, hint, required, placeholder, monospace, type = 'text' } = props
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field.Root invalid={!!fieldState.error} required={required}>
          {label && (
            <Field.Label fontSize="12px" color="ink.muted" fontWeight={500}>
              {label}
              {required && <Field.RequiredIndicator />}
            </Field.Label>
          )}
          <Input
            type={type}
            value={(field.value as string | undefined) ?? ''}
            onChange={(e) => field.onChange(e.target.value)}
            onBlur={field.onBlur}
            ref={field.ref}
            placeholder={placeholder}
            bg="bg.raised"
            borderColor="border"
            color="ink"
            fontFamily={monospace ? 'mono' : 'body'}
            size="sm"
          />
          {fieldState.error?.message ? (
            <Field.ErrorText fontSize="11px" color="state.error">
              {fieldState.error.message}
            </Field.ErrorText>
          ) : hint ? (
            <Field.HelperText fontSize="11px" color="ink.faint">
              {hint}
            </Field.HelperText>
          ) : null}
        </Field.Root>
      )}
    />
  )
}

export function RhfNumberField<T extends FieldValues>(
  props: RhfCommon<T> & {
    min?: number
    max?: number
    step?: number
    unit?: string
    monospace?: boolean
  },
): JSX.Element {
  const { control, name, label, hint, required, min, max, step, unit, monospace = true } = props
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field.Root invalid={!!fieldState.error} required={required}>
          {label && (
            <Field.Label fontSize="12px" color="ink.muted" fontWeight={500}>
              {label}
              {required && <Field.RequiredIndicator />}
            </Field.Label>
          )}
          <Box position="relative" width="100%">
            <NumberInput.Root
              value={String((field.value as number | undefined) ?? '')}
              min={min}
              max={max}
              step={step}
              onValueChange={(details) => {
                const n = Number(details.value)
                if (!Number.isNaN(n)) field.onChange(n)
              }}
              onBlur={field.onBlur}
              size="sm"
              width="100%"
            >
              <NumberInput.Input
                ref={field.ref}
                bg="bg.raised"
                borderColor="border"
                color="ink"
                fontFamily={monospace ? 'mono' : 'body'}
                fontVariantNumeric="tabular-nums"
                pr={unit ? '6' : undefined}
              />
            </NumberInput.Root>
            {unit && (
              <Text
                position="absolute"
                right="2.5"
                top="50%"
                transform="translateY(-50%)"
                fontSize="11px"
                color="ink.faint"
                fontFamily="mono"
                pointerEvents="none"
                userSelect="none"
              >
                {unit}
              </Text>
            )}
          </Box>
          {fieldState.error?.message ? (
            <Field.ErrorText fontSize="11px" color="state.error">
              {fieldState.error.message}
            </Field.ErrorText>
          ) : hint ? (
            <Field.HelperText fontSize="11px" color="ink.faint">
              {hint}
            </Field.HelperText>
          ) : null}
        </Field.Root>
      )}
    />
  )
}

interface SelectOption {
  value: string
  label: string
}

export function RhfSelectField<T extends FieldValues>(
  props: RhfCommon<T> & { options: SelectOption[] },
): JSX.Element {
  const { control, name, label, required, options } = props
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field.Root invalid={!!fieldState.error} required={required}>
          {label && (
            <Field.Label fontSize="12px" color="ink.muted" fontWeight={500}>
              {label}
              {required && <Field.RequiredIndicator />}
            </Field.Label>
          )}
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              value={(field.value as string | undefined) ?? ''}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
              ref={field.ref}
              bg="bg.raised"
              borderColor="border"
              color="ink"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator color="ink.faint" />
          </NativeSelect.Root>
          {fieldState.error?.message && (
            <Field.ErrorText fontSize="11px" color="state.error">
              {fieldState.error.message}
            </Field.ErrorText>
          )}
        </Field.Root>
      )}
    />
  )
}

export function RhfSwitchRow<T extends FieldValues>(
  props: RhfCommon<T> & { description?: string },
): JSX.Element {
  const { control, name, label, description } = props
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <HStack
          justify="space-between"
          align="flex-start"
          py="1.5"
          px="1"
        >
          <Stack gap="0">
            {label && (
              <Text fontSize="12px" color="ink" fontWeight={500}>
                {label}
              </Text>
            )}
            {description && (
              <Text fontSize="11px" color="ink.muted">
                {description}
              </Text>
            )}
          </Stack>
          <Switch.Root
            checked={Boolean(field.value)}
            onCheckedChange={(details) => field.onChange(details.checked)}
            colorPalette="brand"
            size="sm"
          >
            <Switch.HiddenInput ref={field.ref} onBlur={field.onBlur} />
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Root>
        </HStack>
      )}
    />
  )
}
