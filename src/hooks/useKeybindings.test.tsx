import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useKeybindings } from './useKeybindings'

const state = vi.hoisted(() => ({ openModal: 'sync', closeModal: vi.fn() }))
vi.mock('../stores/uiStore', () => ({ useUiStore: { getState: () => state } }))

describe('modal keyboard isolation', () => {
  it('blocks native find while sync is open and keeps Escape usable', () => {
    const view = renderHook(() => useKeybindings())
    for (const init of [{ key: 'F3' }, { key: 'f', ctrlKey: true }]) {
      const event = new KeyboardEvent('keydown', { ...init, cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    expect(state.closeModal).toHaveBeenCalledOnce()
    view.unmount()
  })
})
