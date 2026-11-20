import { describe, expect, it } from 'vitest'

import {
  type CloseFailureStage,
  type CloseRequestEventLike,
  createCloseCoordinator,
} from './closeCoordinator'

function closeEvent(): CloseRequestEventLike & { prevented: number } {
  return {
    prevented: 0,
    preventDefault() {
      this.prevented += 1
    },
  }
}

describe('createCloseCoordinator', () => {
  it('flushes persisted state and quits without destroying the window first', async () => {
    const order: string[] = []
    const coordinator = createCloseCoordinator({
      confirmNative: async () => true,
      beforeClose: async () => {
        order.push('persist')
      },
      destroyWindow: async () => {
        order.push('destroy')
      },
      quitApp: async () => {
        order.push('quit')
      },
    })

    await coordinator.handleCloseRequest(closeEvent())

    expect(order).toEqual(['persist', 'quit'])
  })

  it('cancel keeps the app open and always prevents the original close event', async () => {
    let destroyed = 0
    let quit = 0
    const coordinator = createCloseCoordinator({
      confirmNative: async () => false,
      destroyWindow: async () => {
        destroyed += 1
      },
      quitApp: async () => {
        quit += 1
      },
    })
    const event = closeEvent()

    await coordinator.handleCloseRequest(event)

    expect(event.prevented).toBe(1)
    expect(destroyed).toBe(0)
    expect(quit).toBe(0)
  })

  it('keeps the window open when saving fails and allows another close attempt', async () => {
    const failures: CloseFailureStage[] = []
    let quit = 0
    let attempts = 0
    const coordinator = createCloseCoordinator({
      confirmNative: async () => true,
      beforeClose: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('disk unavailable')
      },
      destroyWindow: async () => {},
      quitApp: async () => { quit += 1 },
      onFailure: (stage) => failures.push(stage),
    })

    await coordinator.handleCloseRequest(closeEvent())
    expect(quit).toBe(0)
    await coordinator.handleCloseRequest(closeEvent())
    expect(quit).toBe(1)
    expect(failures).toEqual(['persist'])
  })

  it('keeps the app open when confirmation fails', async () => {
    const failures: CloseFailureStage[] = []
    let quit = 0
    let destroyed = 0
    const coordinator = createCloseCoordinator({
      confirmNative: async () => {
        throw new Error('dialog unavailable')
      },
      destroyWindow: async () => {
        destroyed += 1
      },
      quitApp: async () => {
        quit += 1
      },
      onFailure: (stage) => failures.push(stage),
    })

    await coordinator.handleCloseRequest(closeEvent())

    expect(quit).toBe(0)
    expect(destroyed).toBe(0)
    expect(failures).toEqual(['confirm'])
  })

  it('the window is never destroyed while the quit command succeeds', async () => {
    let destroyed = 0
    const coordinator = createCloseCoordinator({
      confirmNative: async () => true,
      destroyWindow: async () => {
        destroyed += 1
      },
      quitApp: async () => {},
    })

    await coordinator.handleCloseRequest(closeEvent())

    expect(destroyed).toBe(0)
  })

  it('quit failure falls back to destroying the window', async () => {
    const failures: CloseFailureStage[] = []
    let destroyed = 0
    const coordinator = createCloseCoordinator({
      confirmNative: async () => true,
      destroyWindow: async () => {
        destroyed += 1
      },
      quitApp: async () => {
        throw new Error('quit denied')
      },
      onFailure: (stage) => failures.push(stage),
    })

    await coordinator.handleCloseRequest(closeEvent())

    expect(destroyed).toBe(1)
    expect(failures).toEqual(['quit'])
  })

  it('destroys the window when the native quit request never settles', async () => {
    let destroyed = 0
    const coordinator = createCloseCoordinator({
      confirmNative: async () => true,
      destroyWindow: async () => {
        destroyed += 1
      },
      quitApp: () => new Promise(() => {}),
      quitTimeoutMs: 1,
    })

    await coordinator.handleCloseRequest(closeEvent())

    expect(destroyed).toBe(1)
  })

  it('concurrent close requests open only one confirmation dialog', async () => {
    let confirmCalls = 0
    let resolveConfirm: ((value: boolean) => void) | null = null
    const coordinator = createCloseCoordinator({
      confirmNative: () => {
        confirmCalls += 1
        return new Promise<boolean>((resolve) => {
          resolveConfirm = resolve
        })
      },
      destroyWindow: async () => {},
      quitApp: async () => {},
    })
    const firstEvent = closeEvent()
    const secondEvent = closeEvent()

    const first = coordinator.handleCloseRequest(firstEvent)
    const second = coordinator.handleCloseRequest(secondEvent)
    expect(confirmCalls).toBe(1)
    expect(firstEvent.prevented).toBe(1)
    expect(secondEvent.prevented).toBe(1)

    resolveConfirm?.(false)
    await Promise.all([first, second])
  })

  it('a total close failure resets the guard so the user can retry', async () => {
    let confirmCalls = 0
    const failures: CloseFailureStage[] = []
    const coordinator = createCloseCoordinator({
      confirmNative: async () => {
        confirmCalls += 1
        return true
      },
      destroyWindow: async () => {
        throw new Error('destroy failed')
      },
      quitApp: async () => {
        throw new Error('quit failed')
      },
      onFailure: (stage) => failures.push(stage),
    })

    await coordinator.handleCloseRequest(closeEvent())
    await coordinator.handleCloseRequest(closeEvent())

    expect(confirmCalls).toBe(2)
    expect(failures).toEqual(['quit', 'destroy', 'quit', 'destroy'])
  })
})
