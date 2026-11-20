import { describe, expect, it } from 'vitest'
import { convertCost, normalizeUsageCosts, uniqueCostSessions } from './usageCosts'
import type { Project } from './types'

describe('cost reporting', () => {
  it('keeps missing data unknown and requires exchange metadata', () => {
    const prefs = normalizeUsageCosts({ currency: 'BRL', usdToBrl: 5 })
    expect(convertCost(null, 'USD', prefs)).toBeNull()
    expect(convertCost(10, 'USD', prefs)).toBeNull()
    const complete = { ...prefs, exchangeSource: 'User exchange quote', exchangeDate: '2026-10-04' }
    expect(convertCost(10, 'USD', complete)).toBe(50)
    expect(convertCost(0, 'USD', complete)).toBe(0)
    expect(convertCost(50, 'BRL', { ...complete, currency: 'USD' })).toBe(10)
  })
  it('backfills older profiles and discards invalid amounts', () => {
    expect(normalizeUsageCosts(undefined).currency).toBe('USD')
    const prefs = normalizeUsageCosts({ usdToBrl: -5, subscriptions: { claude: { amount: -1 }, codex: { amount: Infinity }, copilot: { amount: null, plan: 'Personal' } } })
    expect(prefs.usdToBrl).toBeNull()
    expect(Object.keys(prefs.subscriptions)).toEqual(['copilot'])
    expect(prefs.subscriptions.copilot.amount).toBeNull()
  })
  it('does not count resumed sessions twice or guess a missing session id', () => {
    const tab = { type: 'codex', sessionId: 'session-1', cwd: 'E:/project' }
    const projects = [{ terminals: [{ tabs: [tab, { ...tab }, { type: 'claude' }] }] }] as Project[]
    expect(uniqueCostSessions(projects)).toEqual([{ agent: 'codex', id: 'session-1', cwd: 'E:/project' }])
  })
})
