import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetSessionClaimsForTests } from '../../lib/sessionDiscovery'
import { peekSession, saveSession } from '../../lib/sessionResume'
import * as tauri from '../../lib/tauri'
import { EMPTY_PROJECTS_FILE } from '../../lib/types'
import type { AgentHookPayload } from '../../stores/agentCanvasStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { useTerminalsStore } from '../../stores/terminalsStore'
import { useXtermSession } from './useXtermSession'

const hooks = vi.hoisted(() => new Set<(event: { payload: AgentHookPayload }) => void>())
const terminalHandlers = vi.hoisted(() => ({
  key: null as ((event: KeyboardEvent) => boolean) | null,
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name, handler) => {
    hooks.add(handler)
    return () => {
      hooks.delete(handler)
    }
  }),
}))
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
}))
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    unicode = { activeVersion: '11' }
    options = { fontSize: 14 }
    modes = { bracketedPasteMode: true }
    loadAddon() {}
    open() {}
    focus() {}
    registerLinkProvider() {
      return { dispose() {} }
    }
    onScroll() {
      return { dispose() {} }
    }
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      terminalHandlers.key = handler
    }
    onData() {}
    dispose() {}
    writeln() {}
  },
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}))
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }))
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }))
vi.mock('../../lib/ptyVisibility', () => ({ usePtyPanelVisible: () => false }))
vi.mock('../../lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof tauri>()),
  ptyExists: vi.fn(async () => false),
  setPtyVisible: vi.fn(async () => true),
  listenPtyData: vi.fn(async () => () => {}),
  listenPtyActivity: vi.fn(async () => () => {}),
  listenPtyExit: vi.fn(async () => () => {}),
  findCliLauncher: vi.fn(async () => 'claude'),
  snapshotClaudeSessions: vi.fn(async () => [
    { id: 'bananas', modified_at_ms: 1 },
    { id: 'new-chat', modified_at_ms: 2 },
  ]),
  agentHooksSettingsPath: vi.fn(async () => 'hooks.json'),
  spawnPty: vi.fn(async () => ({ id: 'pty-0' })),
  readClipboardPayload: vi.fn(async () => ({ kind: 'text', text: 'Windows paste' })),
  writePty: vi.fn(async () => {}),
}))

function emit(sessionId: string, plannerId = 'pty-0') {
  for (const handler of hooks)
    handler({
      payload: {
        hook_event_name: 'SessionStart',
        session_id: sessionId,
        plannerId,
      },
    })
}

const ref = <T>(current: T) => ({ current })
function params(): Parameters<typeof useXtermSession>[0] {
  return {
    ptyId: 'pty-0',
    command: 'claude',
    cwd: 'D:/repo',
    sessionId: 'bananas',
    runtimeProfile: 'lean',
    terminalTheme: 'dark',
    cliPathOverride: null,
    sessionPersistenceKey: 'tab-0',
    retryKey: 0,
    containerRef: ref(document.createElement('div')),
    terminalRef: ref(null),
    ptyIdRef: ref(null),
    lastCtrlCRef: ref(0),
    linkActionsRef: ref(null),
    spawnedAtRef: ref(0),
    usedResumeRef: ref(false),
    earlyExitRetriedRef: ref(false),
    forceFreshRef: ref(false),
    onSpawnedRef: ref(vi.fn()),
    onSessionIdRef: ref(vi.fn()),
    onInitialInputSentRef: ref(vi.fn()),
    onExitRef: ref(vi.fn()),
    onLaunchErrorRef: ref(vi.fn()),
    onAgentCompleteRef: ref(vi.fn()),
    setBootPhase: vi.fn(),
    setCommandNotFound: vi.fn(),
    setLinkActions: vi.fn(),
    setRetryKey: vi.fn(),
    setDropActive: vi.fn(),
    showLinkActionsMenu: vi.fn(),
    recordPromptInput: () => false,
    navigateHistory: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  hooks.clear()
  terminalHandlers.key = null
  localStorage.clear()
  resetSessionClaimsForTests()
  useProjectsStore.setState({ ...structuredClone(EMPTY_PROJECTS_FILE), hydrated: false })
  useTerminalsStore.setState({ byPtyId: {} })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('Claude terminal session lifecycle', () => {
  it('keeps the native clipboard path for Ctrl+V on Windows', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Windows' })
    useTerminalsStore.getState().registerPty('pty-0')
    const input = params()
    const view = renderHook(() => useXtermSession(input))
    await waitFor(() => expect(input.setBootPhase).toHaveBeenCalledWith('ready'))

    const keydown = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, cancelable: true })
    expect(terminalHandlers.key?.(keydown)).toBe(false)
    expect(keydown.defaultPrevented).toBe(true)
    await waitFor(() => expect(tauri.readClipboardPayload).toHaveBeenCalled())
    await waitFor(() =>
      expect(tauri.writePty).toHaveBeenCalledWith('pty-0', '\x1b[200~Windows paste\x1b[201~'),
    )
    view.unmount()
  })

  it('pastes external text through the webview event without a Linux clipboard helper', async () => {
    useTerminalsStore.getState().registerPty('pty-0')
    const input = params()
    const container = input.containerRef.current
    const textarea = document.createElement('textarea')
    textarea.addEventListener('paste', (event) => event.stopPropagation())
    container.appendChild(textarea)
    const view = renderHook(() => useXtermSession(input))
    await waitFor(() => expect(input.setBootPhase).toHaveBeenCalledWith('ready'))

    const keydown = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, cancelable: true })
    expect(terminalHandlers.key?.(keydown)).toBe(false)
    expect(keydown.defaultPrevented).toBe(false)

    const url = 'https://docs.sauter.digital/pt-br/01-Clientes/Casas-Bahia'
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: (mime: string) => (mime === 'text/plain' ? url : '') },
    })
    textarea.dispatchEvent(paste)

    await waitFor(() =>
      expect(tauri.writePty).toHaveBeenCalledWith('pty-0', `\x1b[200~${url}\x1b[201~`),
    )
    expect(paste.defaultPrevented).toBe(true)
    view.unmount()
  })

  it.each(['frontend', 'backend'])(
    'tracks /new after attaching a live PTY found in the %s',
    async (source) => {
      if (source === 'frontend') useTerminalsStore.getState().registerPty('pty-0')
      else vi.mocked(tauri.ptyExists).mockResolvedValueOnce(true)
      const input = params()
      const view = renderHook(() => useXtermSession(input))
      await waitFor(() => expect(input.setBootPhase).toHaveBeenCalledWith('ready'))
      act(() => emit('new-chat'))
      expect(peekSession('tab-0')?.claudeSessionId).toBe('new-chat')
      expect(input.onSessionIdRef.current).toHaveBeenLastCalledWith('new-chat')
      expect(tauri.spawnPty).not.toHaveBeenCalled()
      view.unmount()
      expect(hooks.size).toBe(0)
    },
  )

  it('does not overwrite a SessionStart received before spawn finishes', async () => {
    vi.mocked(tauri.spawnPty).mockImplementationOnce(async () => {
      emit('new-chat')
      return { id: 'pty-0' }
    })
    const input = params()
    renderHook(() => useXtermSession(input))
    await waitFor(() => expect(input.setBootPhase).toHaveBeenCalledWith('ready'))
    expect(input.onLaunchErrorRef.current).not.toHaveBeenCalled()
    expect(peekSession('tab-0')?.claudeSessionId).toBe('new-chat')
    expect(input.onSessionIdRef.current).toHaveBeenLastCalledWith('new-chat')
  })

  it('resumes the synchronous saved conversation when projects.json still has the old ID', async () => {
    saveSession('tab-0', {
      sessionId: 'pty-0',
      claudeSessionId: 'new-chat',
      agent: 'claude',
      cwd: 'D:/repo',
      timestamp: 1,
    })
    const input = params()
    renderHook(() => useXtermSession(input))
    await waitFor(() => expect(input.setBootPhase).toHaveBeenCalledWith('ready'))
    expect(tauri.spawnPty).toHaveBeenCalledWith(
      expect.objectContaining({
        extraArgs: expect.arrayContaining(['--resume', 'new-chat']),
      }),
    )
    expect(peekSession('tab-0')?.claudeSessionId).toBe('new-chat')
  })

  it('keeps the session callback tied to its tab and ignores other panes', async () => {
    useTerminalsStore.getState().registerPty('pty-0')
    const input = params()
    const original = input.onSessionIdRef.current
    renderHook(() => useXtermSession(input))
    await waitFor(() => expect(input.setBootPhase).toHaveBeenCalledWith('ready'))
    input.onSessionIdRef.current = vi.fn()
    act(() => {
      emit('neighbour', 'pty-1')
      emit('new-chat')
    })
    expect(original).toHaveBeenLastCalledWith('new-chat')
    expect(input.onSessionIdRef.current).not.toHaveBeenCalled()
    expect(peekSession('tab-0')?.claudeSessionId).toBe('new-chat')
  })
})
