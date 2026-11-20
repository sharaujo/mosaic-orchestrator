import { useEffect, useMemo, useState } from 'react'

import { agentLabel, useAgentTypes } from '../../lib/agentProviders'
import { intlLocale, useT } from '../../lib/i18n'
import { getOpenCodeUsageSummary, getSessionCost } from '../../lib/tauri'
import { convertCost, normalizeUsageCosts, uniqueCostSessions } from '../../lib/usageCosts'
import { useProjectsStore } from '../../stores/projectsStore'
import styles from './UsageCosts.module.css'

export function UsageCosts() {
  const t = useT()
  const preferences = useProjectsStore((s) => s.preferences)
  const setPreferences = useProjectsStore((s) => s.setPreferences)
  const projects = useProjectsStore((s) => s.projects)
  const prefs = useMemo(() => normalizeUsageCosts(preferences.usageCosts), [preferences.usageCosts])
  const agents = useAgentTypes().filter((agent) => agent !== 'shell' && agent !== 'wsl')
  const [costs, setCosts] = useState<
    Record<string, { usd: number | null; found: number; total: number }>
  >({})
  const [globalCost, setGlobalCost] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [updated, setUpdated] = useState<number | null>(null)
  const [revision, setRevision] = useState(0)
  const sessionsKey = JSON.stringify(uniqueCostSessions(projects))
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setUpdated(null)
    setCosts({})
    setGlobalCost(null)
    const sessions = JSON.parse(sessionsKey) as ReturnType<typeof uniqueCostSessions>
    const result: typeof costs = {}
    for (const session of sessions) {
      result[session.agent] ??= { usd: null, found: 0, total: 0 }
      result[session.agent].total++
    }
    async function load() {
      // Sequential transcript reads keep large session histories from saturating the disk.
      for (const session of sessions) {
        if (cancelled) return
        try {
          const cost = await getSessionCost(session.agent, session.cwd, session.id)
          if (cost.cost_usd !== null && Number.isFinite(cost.cost_usd) && cost.cost_usd >= 0) {
            const row = result[session.agent]
            row.usd = (row.usd ?? 0) + cost.cost_usd
            row.found++
          }
        } catch {
          /* Unavailable transcripts stay explicitly unknown. */
        }
      }
      if (cancelled) return
      try {
        const global = await getOpenCodeUsageSummary(30 * 24)
        if (!cancelled && global.session_count > 0) setGlobalCost(global.cost_usd)
      } catch {
        /* The global database is optional. */
      }
      if (!cancelled) {
        setCosts(result)
        setLoading(false)
        setUpdated(Date.now())
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sessionsKey, revision])
  const money = (value: number | null, from: 'USD' | 'BRL' = 'USD') => {
    const amount = convertCost(value, from, prefs)
    return amount === null
      ? t('usageCosts.unavailable')
      : new Intl.NumberFormat(intlLocale(preferences.language), {
          style: 'currency',
          currency: prefs.currency,
        }).format(amount)
  }
  const save = (patch: Partial<typeof prefs>) =>
    setPreferences({ usageCosts: normalizeUsageCosts({ ...prefs, ...patch }) })
  return (
    <section className={styles.root}>
      <p>{t('usageCosts.explanation')}</p>
      <div className={styles.settings}>
        <label>
          {t('usageCosts.currency')}
          <select
            value={prefs.currency}
            onChange={(e) => save({ currency: e.target.value as 'USD' | 'BRL' })}
          >
            <option value="USD">USD</option>
            <option value="BRL">BRL</option>
          </select>
        </label>
        <label>
          {t('usageCosts.rate')}
          <input
            type="number"
            min="0.000001"
            step="any"
            value={prefs.usdToBrl ?? ''}
            onChange={(e) =>
              save({ usdToBrl: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </label>
        <label>
          {t('usageCosts.source')}
          <input
            value={prefs.exchangeSource}
            maxLength={200}
            onChange={(e) => save({ exchangeSource: e.target.value })}
          />
        </label>
        <label>
          {t('usageCosts.date')}
          <input
            type="date"
            value={prefs.exchangeDate}
            onChange={(e) => save({ exchangeDate: e.target.value })}
          />
        </label>
      </div>
      <p>{t('usageCosts.manualRate')}</p>
      <div className={styles.actions}>
        <button type="button" disabled={loading} onClick={() => setRevision((v) => v + 1)}>
          {t('widget.refreshUsage')}
        </button>
        <span role="status">
          {loading
            ? t('usageCosts.loading')
            : updated
              ? t('usageCosts.checked', {
                  time: new Date(updated).toLocaleString(intlLocale(preferences.language)),
                })
              : ''}
        </span>
      </div>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>{t('usageCosts.agent')}</th>
              <th>{t('usageCosts.plan')}</th>
              <th>{t('usageCosts.subscription')}</th>
              <th>{t('usageCosts.estimate')}</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => {
              const subscription = prefs.subscriptions[agent]
              const updateSubscription = (patch: Partial<NonNullable<typeof subscription>>) => {
                save({
                  subscriptions: {
                    ...prefs.subscriptions,
                    [agent]: {
                      amount: subscription?.amount ?? null,
                      currency: subscription?.currency ?? 'USD',
                      plan: subscription?.plan ?? '',
                      ...patch,
                    },
                  },
                })
              }
              const row = costs[agent]
              return (
                <tr key={agent}>
                  <th>{agentLabel(agent)}</th>
                  <td>
                    <input
                      aria-label={`${t('usageCosts.plan')} — ${agentLabel(agent)}`}
                      value={subscription?.plan ?? ''}
                      maxLength={100}
                      onChange={(e) => updateSubscription({ plan: e.target.value })}
                    />
                  </td>
                  <td>
                    <div className={styles.price}>
                      <input
                        aria-label={`${t('usageCosts.subscription')} — ${agentLabel(agent)}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={subscription?.amount ?? ''}
                        placeholder={t('usageCosts.notConfigured')}
                        onChange={(e) => {
                          if (e.target.value === '') {
                            const next = { ...prefs.subscriptions }
                            delete next[agent]
                            save({ subscriptions: next })
                          } else updateSubscription({ amount: Number(e.target.value) })
                        }}
                      />
                      <select
                        aria-label={`${t('usageCosts.currency')} — ${agentLabel(agent)}`}
                        value={subscription?.currency ?? 'USD'}
                        onChange={(e) =>
                          updateSubscription({ currency: e.target.value as 'USD' | 'BRL' })
                        }
                      >
                        <option value="USD">USD</option>
                        <option value="BRL">BRL</option>
                      </select>
                    </div>
                    <small>{money(subscription?.amount ?? null, subscription?.currency)}</small>
                  </td>
                  <td>
                    {agent === 'antigravity' ? (
                      <>
                        {t('usageCosts.antigravityEstimateUnavailable')}
                        <small>{t('usageCosts.antigravityQuotaSeparate')}</small>
                      </>
                    ) : agent === 'gemini' ? (
                      <>
                        {t('usageCosts.geminiEstimateUnavailable')}
                        <small>{t('usageGemini.sessionUsageHint')}</small>
                      </>
                    ) : (
                      <>
                        {loading ? t('usageCosts.loading') : money(row?.usd ?? null)}
                        <small>
                          {t('usageCosts.coverage', {
                            found: row?.found ?? 0,
                            total: row?.total ?? 0,
                          })}
                        </small>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p>{t('usageCosts.scope')}</p>
      <p>
        {t('usageCosts.openCodeGlobal')}{' '}
        <strong>{loading ? t('usageCosts.loading') : money(globalCost)}</strong>
      </p>
    </section>
  )
}
