import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { InstallMethod } from '../lib/agentInstall'
import { acquireAgentOperation, releaseAgentOperation, useAgentInstall } from './useAgentInstall'

const mock = vi.hoisted(() => ({
  agentCliVersion: vi.fn(),
  refreshCliLauncher: vi.fn(),
  spawnPty: vi.fn(),
  listenPtyData: vi.fn(),
  listenPtyExit: vi.fn(),
  writePty: vi.fn(),
  killPty: vi.fn(),
}))

vi.mock('../lib/tauri', () => mock)

const method: InstallMethod = { id: 'npm', command: 'npm install -g @mimo-ai/cli' }

beforeEach(() => {
  releaseAgentOperation('mimo')
  vi.clearAllMocks()
  mock.agentCliVersion.mockResolvedValue(null)
  mock.refreshCliLauncher.mockResolvedValue(null)
  mock.spawnPty.mockResolvedValue({ id: 'install-test' })
  mock.listenPtyData.mockResolvedValue(() => undefined)
  mock.listenPtyExit.mockResolvedValue(() => undefined)
  mock.writePty.mockResolvedValue(undefined)
  mock.killPty.mockResolvedValue(undefined)
})

afterEach(() => releaseAgentOperation('mimo'))

describe('useAgentInstall', () => {
  it('reports a failed preflight and releases the installer lock', async () => {
    mock.agentCliVersion.mockRejectedValue(new Error('version probe failed'))
    const view = renderHook(() => useAgentInstall('mimo'))

    await act(async () => view.result.current.install(method))

    expect(view.result.current.status).toBe('failed')
    expect(view.result.current.log).toContain('version probe failed')
    expect(mock.spawnPty).not.toHaveBeenCalled()
    expect(acquireAgentOperation('another-agent')).toBe(true)
    releaseAgentOperation('another-agent')
    view.unmount()
  })

  it('stops a silent installer and ignores its late completion', async () => {
    const view = renderHook(() => useAgentInstall('mimo'))
    let run: Promise<void> = Promise.resolve()

    act(() => {
      run = view.result.current.install(method)
    })
    await waitFor(() => expect(mock.spawnPty).toHaveBeenCalled())

    act(() => view.result.current.cancel())
    await act(async () => run)

    expect(view.result.current.status).toBe('cancelled')
    expect(mock.killPty).toHaveBeenCalledWith('install-test')
    expect(mock.writePty).not.toHaveBeenCalled()
    expect(acquireAgentOperation('another-agent')).toBe(true)
    releaseAgentOperation('another-agent')
    view.unmount()
  })

  it('shows the process exit code when the installer fails', async () => {
    let onExit: ((payload: { code: number; reason: 'exited' }) => void) | undefined
    mock.listenPtyExit.mockImplementation(async (_id, handler) => {
      onExit = handler
      return () => undefined
    })
    const view = renderHook(() => useAgentInstall('mimo'))

    await act(async () => view.result.current.install(method))
    act(() => onExit?.({ code: 7, reason: 'exited' }))

    expect(view.result.current.status).toBe('failed')
    expect(view.result.current.log).toContain('Installer exited with code 7')
    view.unmount()
  })

  it('keeps the installer running when a binary appears before npm exits', async () => {
    mock.refreshCliLauncher.mockResolvedValue('/tmp/mimo')
    const view = renderHook(() => useAgentInstall('mimo'))

    await act(async () => view.result.current.install(method))

    expect(view.result.current.status).toBe('running')
    expect(mock.refreshCliLauncher).not.toHaveBeenCalled()
    expect(mock.killPty).not.toHaveBeenCalled()
    view.unmount()
  })
})
