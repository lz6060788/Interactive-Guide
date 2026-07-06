/**
 * ImeSafeInput — a Chakra <Input> that survives CJK IME composition.
 *
 * The bug: when a controlled <Input> calls onChange on every input
 * event, IME composition (typing pinyin / candidates) fires onChange
 * with intermediate strings. The parent then re-renders with the
 * intermediate value, which is wrong (the user hasn't picked a
 * candidate yet), and React's controlled-input machinery rewinds the
 * visible text. Result: "a'sda" instead of "你好".
 *
 * The fix: hold a local "draft" while composing, ignore external
 * `value` until composition ends, and only call onChange once with the
 * final value at composition end.
 */
import { useEffect, useRef, useState } from 'react'
import { Input, type InputProps } from '@chakra-ui/react'

interface Props
  extends Omit<InputProps, 'value' | 'onChange' | 'onCompositionStart' | 'onCompositionEnd'> {
  value: string
  onChange: (next: string) => void
}

export function ImeSafeInput({ value, onChange, ...rest }: Props): JSX.Element {
  const [internal, setInternal] = useState(value)
  const [composing, setComposing] = useState(false)
  // Last value we forwarded to the parent. The useEffect below must NOT
  // clobber the local draft with the parent's stale value just because
  // composition ended — the parent will catch up after the commit, and
  // we want to ignore that echo.
  const lastSentRef = useRef(value)

  useEffect(() => {
    if (composing) return
    if (value === lastSentRef.current) return
    lastSentRef.current = value
    setInternal(value)
  }, [value, composing])

  const commit = (next: string) => {
    lastSentRef.current = next
    onChange(next)
  }

  return (
    <Input
      {...rest}
      value={internal}
      onChange={(e) => {
        const v = e.target.value
        setInternal(v)
        if (!composing) commit(v)
      }}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={() => {
        // The committed value is whatever the input has accumulated in
        // `internal` so far. Don't trust e.currentTarget.value — in
        // some test environments the input's actual value isn't synced
        // with the simulated event payload.
        setComposing(false)
        commit(internal)
      }}
    />
  )
}
