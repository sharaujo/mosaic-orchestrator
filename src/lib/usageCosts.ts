import type { Project, UsageCostPreferences } from './types'

export const DEFAULT_USAGE_COSTS: UsageCostPreferences = {
  currency: 'USD',
  usdToBrl: null,
  exchangeSource: '',
  exchangeDate: '',
  subscriptions: {},
}

export function normalizeUsageCosts(raw: unknown): UsageCostPreferences {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<UsageCostPreferences>
  const subscriptions: UsageCostPreferences['subscriptions'] = {}
  for (const [key, item] of Object.entries(value.subscriptions ?? {})) {
    if (!item || typeof item !== 'object') continue
    if (
      item.amount !== null &&
      (typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount < 0)
    )
      continue
    subscriptions[key] = {
      amount: item.amount,
      currency: item.currency === 'BRL' ? 'BRL' : 'USD',
      plan: typeof item.plan === 'string' ? item.plan.slice(0, 100) : '',
    }
  }
  return {
    currency: value.currency === 'BRL' ? 'BRL' : 'USD',
    usdToBrl:
      typeof value.usdToBrl === 'number' && Number.isFinite(value.usdToBrl) && value.usdToBrl > 0
        ? value.usdToBrl
        : null,
    exchangeSource:
      typeof value.exchangeSource === 'string' ? value.exchangeSource.slice(0, 200) : '',
    exchangeDate:
      typeof value.exchangeDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.exchangeDate)
        ? value.exchangeDate
        : '',
    subscriptions,
  }
}

export function convertCost(
  amount: number | null,
  from: 'USD' | 'BRL',
  prefs: UsageCostPreferences,
): number | null {
  if (amount === null || !Number.isFinite(amount) || amount < 0) return null
  if (from === prefs.currency) return amount
  if (!prefs.usdToBrl || !prefs.exchangeSource.trim() || !prefs.exchangeDate) return null
  return from === 'USD' ? amount * prefs.usdToBrl : amount / prefs.usdToBrl
}

/** A resumed session can occur in several tabs; count its complete transcript once. */
export function uniqueCostSessions(projects: Project[]) {
  const sessions = new Map<string, { agent: string; cwd: string; id: string }>()
  for (const project of projects)
    for (const terminal of project.terminals)
      for (const tab of terminal.tabs) {
        if (!tab.sessionId || !['claude', 'codex', 'opencode'].includes(tab.type)) continue
        sessions.set(`${tab.type}:${tab.sessionId}`, {
          agent: tab.type,
          cwd: tab.cwd,
          id: tab.sessionId,
        })
      }
  return [...sessions.values()]
}
