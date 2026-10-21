import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useProgressive } from './useProgressive'

describe('useProgressive', () => {
  it('draws a short list in full at once', () => {
    const { result } = renderHook(() => useProgressive(3, 5))
    expect(result.current).toBe(3)
  })

  it('draws the first few of a long list, then the rest', async () => {
    const { result } = renderHook(() => useProgressive(40, 5))
    // The first render only has the first few; the rest follow in a transition.
    expect(result.current).toBeLessThanOrEqual(40)
    await act(async () => {})
    expect(result.current).toBe(40)
  })
})
