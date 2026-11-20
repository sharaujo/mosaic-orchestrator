import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { type InstallMethod, installShellLine } from '../lib/agentInstall'
import { resolveAgentCliCommand } from '../lib/agentProviders'
import {
  agentCliVersion,
  killPty,
  listenPtyData,
  listenPtyExit,
  refreshCliLauncher,
  spawnPty,
  writePty,
} from '../lib/tauri'
import type { AgentType } from '../lib/types'

export type AgentInstallStatus = 'idle' | 'running' | 'success' | 'failed' | 'cancelled'

/**
 * Set only when a run finished with the installer reporting success and the resolver still
 * finding a binary, but the version at that binary never moved — the installer likely updated a
 * different install of the same CLI than the one PATH resolves to. Holds that binary's path so
 * the caller can name it.
 */
export type AgentInstallShadowConflict = { path: string }

const MAX_LOG_CHARS = 12_000
const PROMPT_SETTLE_MS = 400

function trimLog(value: string): string {
  return value.length > MAX_LOG_CHARS ? value.slice(value.length - MAX_LOG_CHARS) : value
}

export { trimLog as trimInstallLog }

/*
 * Package managers serialize badly: two `npm -g` runs fight over the same global directory, and
 * WinGet refuses to run twice at once. Only one agent operation is allowed at a time, app-wide.
 */
let busyAgent: string | null = null
const busyListeners = new Set<() => void>()

function setBusyAgent(agent: string | null): void {
  busyAgent = agent
  for (const listener of busyListeners) listener()
}

/** Takes the app-wide package-manager lock, or returns false when another run already holds it. */
export function acquireAgentOperation(key: string): boolean {
  if (busyAgent !== null) return false
  setBusyAgent(key)
  return true
}

export function releaseAgentOperation(key: string): void {
  if (busyAgent === key) setBusyAgent(null)
}

/** The agent whose install/uninstall is running right now, or null when nothing is. */
export function useAgentOperationBusy(): string | null {
  return useSyncExternalStore(
    (onChange) => {
      busyListeners.add(onChange)
      return () => busyListeners.delete(onChange)
    },
    () => busyAgent,
  )
}

/**
 * `lockKey` identifies the run that holds the app-wide lock. It defaults to the agent, and only
 * differs when the same screen also installs something else for that agent — the Node toolchain —
 * which must not look like the agent's own run or the two would be allowed to run together.
 */
export function useAgentInstall(agent: AgentType, lockKey: string = agent) {
  const [status, setStatus] = useState<AgentInstallStatus>('idle')
  const [log, setLog] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [lastOutputAt, setLastOutputAt] = useState<number | null>(null)
  const [shadowConflict, setShadowConflict] = useState<AgentInstallShadowConflict | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const cleanupRef = useRef<Array<() => void>>([])
  const disposedRef = useRef(false)
  const settledRef = useRef(false)
  const runIdRef = useRef(0)

  const teardown = useCallback(() => {
    cleanupRef.current.forEach((stop) => stop())
    cleanupRef.current = []
    const ptyId = ptyIdRef.current
    ptyIdRef.current = null
    if (ptyId) void killPty(ptyId).catch(() => undefined)
    // Never leave the app-wide lock held by a run that is gone.
    if (busyAgent === lockKey) setBusyAgent(null)
  }, [lockKey])

  /** Finish only after the installer shell exits, so an early binary cannot abort npm mid-install. */
  const settle = useCallback(
    (outcome: 'success' | 'failed', runId: number) => {
      if (runId !== runIdRef.current || settledRef.current) return
      settledRef.current = true
      teardown()
      setStatus(outcome)
    },
    [teardown],
  )

  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      runIdRef.current += 1
      teardown()
    }
  }, [teardown])

  const install = useCallback(
    async (method: InstallMethod) => {
      if (status === 'running' || busyAgent !== null) return
      teardown()
      const runId = ++runIdRef.current
      setLog('')
      setStartedAt(Date.now())
      setLastOutputAt(null)
      setShadowConflict(null)
      settledRef.current = false
      setStatus('running')
      setBusyAgent(lockKey)

      const ptyId = `agent-install:${lockKey}:${Date.now()}`
      try {
        const command = method.verifyCommand ?? resolveAgentCliCommand(agent)
        // A fresh install has no version to compare; updates must move the resolved version.
        const beforeVersion =
          command && !method.verifyAbsent ? await agentCliVersion(command) : null
        if (runId !== runIdRef.current || disposedRef.current) return

        /** Re-read PATH because an installer may update the user's environment. */
        const verify = async (): Promise<boolean> => {
          if (!command) return false
          const found = await refreshCliLauncher(command).catch(() => null)
          if (method.verifyAbsent) return !found
          if (!found) return false
          if (!beforeVersion) return true
          const afterVersion = await agentCliVersion(command).catch(() => null)
          return Boolean(afterVersion && afterVersion !== beforeVersion)
        }

        // A bare shell, then the command written into it: the native installers
        // are pipelines (`irm ... | iex`), which cannot be expressed as a
        // launcher plus argv.
        const spawned = await spawnPty({
          cols: 100,
          rows: 24,
          id: ptyId,
          env: method.id === 'npm' ? { npm_config_progress: 'false', NO_COLOR: '1' } : undefined,
        })
        if (runId !== runIdRef.current || disposedRef.current) {
          void killPty(spawned.id).catch(() => undefined)
          return
        }
        ptyIdRef.current = spawned.id

        const stopData = await listenPtyData(spawned.id, (chunk) => {
          if (runId !== runIdRef.current || disposedRef.current) return
          setLog((current) => trimLog(current + chunk))
          if (chunk.trim()) setLastOutputAt(Date.now())
        })
        if (runId !== runIdRef.current || disposedRef.current) {
          stopData()
          return
        }
        cleanupRef.current.push(stopData)
        const stopExit = await listenPtyExit(spawned.id, (payload) => {
          if (runId !== runIdRef.current) return
          ptyIdRef.current = null
          if (settledRef.current) return
          // `installShellLine` preserves the installer command's exit status. A non-zero code means the installer
          // itself reported failure (network error, permission denied, ...) — trust it
          // instead of falling through to the resolver, which would still find the
          // previous binary on PATH and misreport the run as a success.
          if (payload.code !== 0 || !command) {
            setLog((current) =>
              trimLog(
                `${current}\nInstaller exited with code ${payload.code ?? 'unknown'} (${payload.reason}).`,
              ),
            )
            settle('failed', runId)
            return
          }
          // A zero exit code still doesn't confirm the binary landed somewhere we
          // can launch it from, so ask the resolver.
          void verify()
            .then(async (worked) => {
              if (disposedRef.current || runId !== runIdRef.current || settledRef.current) return
              if (worked) {
                settle('success', runId)
                return
              }
              // The installer exited clean and a binary is still there, but its version never
              // moved: the run likely reached a different install of this CLI than the one PATH
              // resolves to — a shadowing copy the update never touched. Name it for the caller.
              const found = beforeVersion
                ? await refreshCliLauncher(command).catch(() => null)
                : null
              if (disposedRef.current || runId !== runIdRef.current) return
              if (found) setShadowConflict({ path: found })
              settle('failed', runId)
            })
            .catch(() => {
              if (!disposedRef.current) settle('failed', runId)
            })
        })
        if (runId !== runIdRef.current || disposedRef.current) {
          stopExit()
          return
        }
        cleanupRef.current.push(stopExit)

        await new Promise((resolve) => setTimeout(resolve, PROMPT_SETTLE_MS))
        if (runId !== runIdRef.current || disposedRef.current) return
        await writePty(spawned.id, installShellLine(method.command))
      } catch (error) {
        if (runId !== runIdRef.current || disposedRef.current) return
        setLog((current) => trimLog(`${current}\n${String(error)}`))
        settle('failed', runId)
      }
    },
    [agent, lockKey, settle, status, teardown],
  )

  const reset = useCallback(() => {
    runIdRef.current += 1
    teardown()
    settledRef.current = false
    setLog('')
    setStartedAt(null)
    setLastOutputAt(null)
    setShadowConflict(null)
    setStatus('idle')
  }, [teardown])

  const cancel = useCallback(() => {
    if (status !== 'running') return
    runIdRef.current += 1
    settledRef.current = true
    teardown()
    setStatus('cancelled')
  }, [status, teardown])

  return { status, log, startedAt, lastOutputAt, shadowConflict, install, reset, cancel }
}
