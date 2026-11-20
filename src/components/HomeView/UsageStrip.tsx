import { Clock, RefreshCw } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import { getCachedAntigravityUsage } from '../../lib/antigravityUsageCache'
import { getCachedClaudeUsage } from '../../lib/claudeUsageCache'
import { getCachedCodexUsage } from '../../lib/codexUsageCache'
import { getCachedCopilotUsage } from '../../lib/copilotUsageCache'
import { getLocale, translate, useT } from '../../lib/i18n'
import {
  type AntigravityUsage,
  type ClaudeUsage,
  type CodexUsage,
  type CopilotUsage,
  type GeminiUsageSummary,
} from '../../lib/tauri'
import { getGeminiUsageSummary, openInBrowser } from '../../lib/tauri'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import { AgentIcon, AntigravityIcon, ClaudeIcon, CodexIcon } from '../icons/AgentIcons'
import { ActivityGraph } from './ActivityGraph'
import styles from './HomeView.module.css'

function formatDiff(diff: number): string {
  if (Number.isNaN(diff)) return '—'
  if (diff <= 0) return translate(getLocale(), 'widget.resetting')
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d}d ${h % 24}h`
  }
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function ResetCountdown({ resetsAt }: { resetsAt: string | number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const timestamp = typeof resetsAt === 'number' ? resetsAt : new Date(resetsAt).getTime()
  return <>{formatDiff(timestamp - now)}</>
}

function meterColor(util: number, base: string): string {
  if (util >= 80) return 'var(--status-offline)'
  if (util >= 50) return 'var(--status-waiting)'
  return base
}

function pctNum(v: number): number {
  return Math.round(v)
}

function CardHead({
  badgeClass,
  icon,
  name,
  plan,
  accent,
  hasData,
  showLive = true,
  onRefresh,
}: {
  badgeClass: string
  icon: ReactNode
  name: string
  plan?: string
  accent: string
  hasData: boolean
  showLive?: boolean
  onRefresh: () => Promise<void>
}) {
  const t = useT()
  const [refreshing, setRefreshing] = useState(false)
  const handle = async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }
  return (
    <div className={styles.cardHead}>
      <div className={`${styles.badge} ${badgeClass}`}>{icon}</div>
      <span className={styles.name}>{name}</span>
      {plan && <span className={styles.plan}>{plan}</span>}
      <div className={styles.headRight}>
        {hasData && showLive && (
          <span className={styles.live}>
            <span className={styles.liveDot} style={{ background: accent }} />
            {t('widget.live')}
          </span>
        )}
        <button
          type="button"
          className={styles.iconBtn}
          onClick={handle}
          disabled={refreshing}
          title={hasData ? t('widget.refreshUsage') : t('widget.tryAgain')}
        >
          <RefreshCw size={12} className={refreshing ? styles.iconBtnSpin : undefined} />
        </button>
      </div>
    </div>
  )
}

function Hero({
  percent,
  reset,
  sub,
  critical,
}: {
  percent: number
  reset: ReactNode
  sub: ReactNode
  critical?: boolean
}) {
  return (
    <>
      <div className={styles.hero}>
        <div className={styles.heroNumWrap}>
          <span className={styles.heroNum}>{pctNum(percent)}</span>
          <span className={styles.heroDen}>%</span>
        </div>
        <span className={styles.timechip}>
          <Clock size={11} />
          <b>{reset}</b>
        </span>
      </div>
      <div className={`${styles.heroSub} ${critical ? styles.heroSubCrit : ''}`}>{sub}</div>
    </>
  )
}

function Meter({
  label,
  reset,
  value,
  util,
  base,
}: {
  label: string
  reset?: ReactNode
  value: string
  util: number
  base: string
}) {
  const color = meterColor(util, base)
  const pulse = util >= 80
  return (
    <div className={styles.meter}>
      <div className={styles.meterRow}>
        <span className={styles.meterLabel}>
          {label}
          {reset && <span className={styles.meterReset}>{reset}</span>}
        </span>
        <span className={styles.meterValue}>{value}</span>
      </div>
      <div className={styles.meterBar}>
        <div
          className={`${styles.meterFill} ${pulse ? styles.meterFillPulse : ''}`}
          style={{ width: `${Math.min(util, 100)}%`, background: color }}
        />
      </div>
    </div>
  )
}

function CardFoot({ accent, left, right }: { accent: string; left: ReactNode; right: ReactNode }) {
  return (
    <div className={styles.cardFoot}>
      <span className={styles.cardFootLeft}>
        <span className={styles.cardFootDot} style={{ background: accent }} />
        {left}
      </span>
      <span className={styles.cardFootRight}>{right}</span>
    </div>
  )
}

function StatCell({ label, value, crit }: { label: string; value: ReactNode; crit?: boolean }) {
  return (
    <div className={styles.statCell}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} ${crit ? styles.statValueCrit : ''}`}>{value}</span>
    </div>
  )
}

function ClaudeCard({ usage }: { usage: ClaudeUsage | null }) {
  const t = useT()
  const setClaudeUsage = useUiStore((s) => s.setClaudeUsage)
  const accent = 'var(--agent-claude)'

  const refresh = async () => {
    try {
      setClaudeUsage(await getCachedClaudeUsage(true))
    } catch {
      setClaudeUsage(null)
    }
  }

  const head = (
    <CardHead
      badgeClass={styles.badgeClaude}
      icon={<ClaudeIcon size={16} />}
      name="claude code"
      accent={accent}
      hasData={!!usage}
      onRefresh={refresh}
    />
  )

  if (!usage) {
    return (
      <div className={styles.usageCard}>
        {head}
        <div className={styles.usageEmpty}>
          <span className={styles.usageEmptyTitle}>{t('widget.noTokenConfigured')}</span>
          <span className={styles.usageEmptyHint}>{t('widget.connectToSeeUsage')}</span>
        </div>
      </div>
    )
  }

  const maxUtil = Math.max(
    usage.five_hour.utilization,
    usage.seven_day.utilization,
    usage.seven_day_opus.utilization,
  )

  return (
    <div className={styles.usageCard}>
      {head}
      <Hero
        percent={usage.five_hour.utilization}
        reset={<ResetCountdown resetsAt={usage.five_hour.resets_at} />}
        critical={usage.five_hour.utilization >= 80}
        sub={
          <>
            {t('widget.usage5h')} ·{' '}
            <b>
              {t('widget.week')} {pctNum(usage.seven_day.utilization)}%
            </b>
          </>
        }
      />
      <div className={styles.cardBody}>
        <div className={styles.meterList}>
          <Meter
            label="5h"
            value={`${pctNum(usage.five_hour.utilization)}%`}
            util={usage.five_hour.utilization}
            base={accent}
          />
          <Meter
            label={t('widget.week')}
            value={`${pctNum(usage.seven_day.utilization)}%`}
            util={usage.seven_day.utilization}
            base={accent}
          />
          <Meter
            label="opus"
            value={`${pctNum(usage.seven_day_opus.utilization)}%`}
            util={usage.seven_day_opus.utilization}
            base={accent}
          />
        </div>
        <div className={styles.statGrid}>
          <StatCell
            label={t('widget.resetLabel', { w: '5h' })}
            value={<ResetCountdown resetsAt={usage.five_hour.resets_at} />}
          />
          <StatCell
            label={t('widget.resetLabel', { w: t('widget.week') })}
            value={<ResetCountdown resetsAt={usage.seven_day.resets_at} />}
          />
          <StatCell
            label={t('widget.resetLabel', { w: 'opus' })}
            value={<ResetCountdown resetsAt={usage.seven_day_opus.resets_at} />}
          />
          <StatCell
            label={t('widget.peakLabel')}
            value={`${pctNum(maxUtil)}%`}
            crit={maxUtil >= 80}
          />
        </div>
      </div>
      <CardFoot
        accent={accent}
        left={`5h · ${t('widget.week')} · opus`}
        right={t('widget.peak', { v: `${pctNum(maxUtil)}%` })}
      />
    </div>
  )
}

function CodexCard({
  usage,
  showResetCreditAction,
}: {
  usage: CodexUsage | null
  showResetCreditAction: boolean
}) {
  const t = useT()
  const setCodexUsage = useUiStore((s) => s.setCodexUsage)
  const openModal = useUiStore((s) => s.openModal_)
  const accent = 'var(--agent-codex)'

  const refresh = async () => {
    try {
      setCodexUsage(await getCachedCodexUsage(true))
    } catch {
      setCodexUsage(null)
    }
  }

  const head = (
    <CardHead
      badgeClass={styles.badgeCodex}
      icon={<CodexIcon size={16} />}
      name="codex"
      plan={usage?.plan || undefined}
      accent={accent}
      hasData={!!usage}
      onRefresh={refresh}
    />
  )

  if (!usage) {
    return (
      <div className={styles.usageCard}>
        {head}
        <div className={styles.usageEmpty}>
          <span className={styles.usageEmptyTitle}>{t('widget.codexNotSignedIn')}</span>
          <span className={styles.usageEmptyHint}>{t('widget.codexSignInHint')}</span>
        </div>
      </div>
    )
  }

  const maxUtil = Math.max(usage.primary.used_percent, usage.secondary.used_percent)

  return (
    <div className={styles.usageCard}>
      {head}
      <Hero
        percent={usage.primary.used_percent}
        reset={<ResetCountdown resetsAt={usage.primary.resets_at_ms} />}
        critical={usage.rate_limited || usage.primary.used_percent >= 80}
        sub={
          usage.rate_limited ? (
            t('widget.limitReached')
          ) : (
            <>
              {t('widget.usage5h')} ·{' '}
              <b>
                {t('widget.week')} {pctNum(usage.secondary.used_percent)}%
              </b>
            </>
          )
        }
      />
      <div className={styles.cardBody}>
        <div className={styles.meterList}>
          <Meter
            label="5h"
            value={`${pctNum(usage.primary.used_percent)}%`}
            util={usage.primary.used_percent}
            base={accent}
          />
          <Meter
            label={t('widget.week')}
            value={`${pctNum(usage.secondary.used_percent)}%`}
            util={usage.secondary.used_percent}
            base={accent}
          />
        </div>
        <div className={styles.statGrid}>
          <StatCell
            label={t('widget.resetLabel', { w: '5h' })}
            value={<ResetCountdown resetsAt={usage.primary.resets_at_ms} />}
          />
          <StatCell
            label={t('widget.resetLabel', { w: t('widget.week') })}
            value={<ResetCountdown resetsAt={usage.secondary.resets_at_ms} />}
          />
          <StatCell
            label={t('widget.statusLabel')}
            value={usage.rate_limited ? t('widget.statusLimited') : t('widget.statusOk')}
            crit={usage.rate_limited}
          />
        </div>
        {showResetCreditAction && usage.reset_credits > 0 ? (
          <div className={styles.resetCreditBox}>
            <span className={styles.resetCreditTitle}>{t('widget.resetCreditHeading')}</span>
            <button
              type="button"
              className={styles.resetCreditButton}
              onClick={() => openModal('resetCredit')}
            >
              {t('widget.resetCredits', { n: usage.reset_credits })}
            </button>
          </div>
        ) : null}
      </div>
      <CardFoot
        accent={accent}
        left={`5h · ${t('widget.week')}`}
        right={t('widget.peak', { v: `${pctNum(maxUtil)}%` })}
      />
    </div>
  )
}

function AntigravityCard({ usage }: { usage: AntigravityUsage | null }) {
  const t = useT()
  const setAntigravityUsage = useUiStore((s) => s.setAntigravityUsage)
  const accent = 'var(--agent-antigravity)'

  const refresh = async () => {
    try {
      setAntigravityUsage(await getCachedAntigravityUsage(true))
    } catch {
      setAntigravityUsage(null)
    }
  }

  const hasData = usage?.status === 'ready' && usage.buckets.length > 0
  const head = (
    <CardHead
      badgeClass={styles.badgeAntigravity}
      icon={<AntigravityIcon size={16} />}
      name="antigravity"
      plan={hasData ? `${usage.buckets.length} ${t('widget.quotaBucketsShort')}` : undefined}
      accent={accent}
      hasData={hasData}
      onRefresh={refresh}
    />
  )

  if (!usage || !hasData) {
    const emptyTitle =
      usage?.status === 'no_cli'
        ? t('widget.antigravityNotInstalled')
        : usage?.status === 'no_auth'
          ? t('widget.antigravityNotSignedIn')
          : t('widget.usageUnavailable')
    return (
      <div className={styles.usageCard}>
        {head}
        <div className={styles.usageEmpty}>
          <span className={styles.usageEmptyTitle}>{emptyTitle}</span>
          <span className={styles.usageEmptyHint}>{t('widget.antigravityUsageHint')}</span>
        </div>
      </div>
    )
  }

  const primary = usage.buckets[0]
  return (
    <div className={styles.usageCard}>
      {head}
      <Hero
        percent={usage.used_percent}
        reset={<ResetCountdown resetsAt={primary.resets_at} />}
        critical={usage.rate_limited || usage.used_percent >= 80}
        sub={
          usage.rate_limited
            ? t('widget.limitReached')
            : t('widget.mostUsedBucket', { name: primary.label })
        }
      />
      <div className={styles.cardBody}>
        <div className={styles.meterList}>
          {usage.buckets.map((bucket) => (
            <Meter
              key={`${bucket.label}:${bucket.resets_at}`}
              label={bucket.label}
              reset={<ResetCountdown resetsAt={bucket.resets_at} />}
              value={`${pctNum(bucket.used_percent)}%`}
              util={bucket.used_percent}
              base={accent}
            />
          ))}
        </div>
        <div className={styles.statGrid}>
          <StatCell
            label={t('widget.statusLabel')}
            value={usage.rate_limited ? t('widget.statusLimited') : t('widget.statusOk')}
            crit={usage.rate_limited}
          />
          <StatCell
            label={t('widget.remainingLabel')}
            value={`${pctNum(primary.remaining_percent)}%`}
            crit={primary.remaining_percent <= 1}
          />
          <StatCell
            label={t('widget.modelsLabel')}
            value={String(usage.buckets.reduce((sum, bucket) => sum + bucket.models.length, 0))}
          />
          <StatCell
            label={t('widget.peakLabel')}
            value={`${pctNum(usage.used_percent)}%`}
            crit={usage.used_percent >= 80}
          />
        </div>
      </div>
      <CardFoot
        accent={accent}
        left={usage.buckets.map((bucket) => bucket.label).join(' · ')}
        right={t('widget.quotaBuckets', { n: usage.buckets.length })}
      />
    </div>
  )
}

function CopilotCard({ usage }: { usage: CopilotUsage | null }) {
  const t = useT()
  const setCopilotUsage = useUiStore((s) => s.setCopilotUsage)
  const theme = useProjectsStore((s) => s.preferences.uiTheme)
  const [loading, setLoading] = useState(true)
  const accent = 'var(--accent)'
  const refresh = async () => {
    setLoading(true)
    try {
      setCopilotUsage(await getCachedCopilotUsage(true))
    } catch {
      setCopilotUsage(null)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void getCachedCopilotUsage()
      .then(setCopilotUsage)
      .catch(() => setCopilotUsage(null))
      .finally(() => setLoading(false))
  }, [setCopilotUsage])
  const primary = usage?.snapshots[0]
  const hasData = usage?.status === 'ready' && Boolean(primary)
  const usedPercent = primary ? 100 - primary.remaining_percent : 0
  const unlimited = primary?.entitlement_requests === -1
  const head = (
    <CardHead
      badgeClass={styles.badgeCopilot}
      icon={<AgentIcon type="copilot" size={16} theme={theme} />}
      name={t('usageCopilot.label')}
      accent={accent}
      hasData={hasData}
      onRefresh={refresh}
    />
  )

  if (!usage || !hasData || !primary) {
    const title =
      usage?.status === 'no_auth'
        ? t('usageCopilot.notSignedIn')
        : usage?.status === 'unavailable'
          ? t('usageCopilot.unavailable')
          : t('widget.usageUnavailable')
    return (
      <div className={styles.usageCard}>
        {head}
        <div className={styles.usageEmpty}>
          <span className={styles.usageEmptyTitle}>{title}</span>
          <span className={styles.usageEmptyHint}>
            {usage?.status === 'no_auth'
              ? t('usageCopilot.loginHint')
              : loading
                ? t('usageCosts.loading')
                : t('usageCopilot.limitations')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.usageCard}>
      {head}
      <div className={styles.hero}>
        <div className={styles.heroNumWrap}>
          <span className={styles.heroNum}>
            {unlimited ? primary.used_requests : Math.round(usedPercent)}
          </span>
          <span className={styles.heroDen}>{unlimited ? t('usageCopilot.requests') : '%'}</span>
        </div>
        <span className={styles.timechip}>
          <b>
            {unlimited
              ? t('usageCopilot.unlimited')
              : `${primary.used_requests} / ${primary.entitlement_requests}`}
          </b>
        </span>
      </div>
      <div className={styles.heroSub}>
        {primary.label}
        {primary.resets_at
          ? ` · ${t('usageCopilot.resets', { date: new Date(primary.resets_at).toLocaleDateString() })}`
          : ''}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.meterList}>
          {usage.snapshots.map((snapshot) => {
            const used = 100 - snapshot.remaining_percent
            const isUnlimited = snapshot.entitlement_requests === -1
            return (
              <div className={styles.meter} key={snapshot.key}>
                <div className={styles.meterRow}>
                  <span className={styles.meterLabel}>{snapshot.label}</span>
                  <span className={styles.meterValue}>
                    {isUnlimited
                      ? `${snapshot.used_requests} ${t('usageCopilot.requests')}`
                      : `${Math.round(used)}%`}
                  </span>
                </div>
                <div className={styles.meterBar}>
                  <div
                    className={styles.meterFill}
                    style={{
                      width: `${isUnlimited ? 0 : Math.min(used, 100)}%`,
                      background: accent,
                    }}
                  />
                </div>
                <span className={styles.usageEmptyHint}>
                  {isUnlimited
                    ? t('usageCopilot.unlimited')
                    : `${snapshot.used_requests} / ${snapshot.entitlement_requests}`}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className={styles.copilotActions}>
        <button
          type="button"
          onClick={() =>
            void openInBrowser('https://github.com/settings/copilot').catch((error) =>
              useUiStore
                .getState()
                .pushToast({ title: t('files.actionFailed'), body: String(error) }),
            )
          }
        >
          {t('usageCopilot.open')}
        </button>
      </div>
    </div>
  )
}

function GeminiCard() {
  const t = useT()
  const theme = useProjectsStore((s) => s.preferences.uiTheme)
  const [usage, setUsage] = useState<GeminiUsageSummary | null>(null)
  const accent = 'var(--agent-gemini)'

  const refresh = async () => {
    try {
      setUsage(await getGeminiUsageSummary())
    } catch {
      setUsage(null)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const hasData = usage?.status === 'ready' && usage.total_tokens > 0
  const head = (
    <CardHead
      badgeClass={styles.badgeGemini}
      icon={<AgentIcon type="gemini" size={16} theme={theme} />}
      name={t('usageGemini.label')}
      accent={accent}
      hasData={hasData}
      showLive={false}
      onRefresh={refresh}
    />
  )

  if (!hasData || !usage) {
    return (
      <div className={styles.usageCard}>
        {head}
        <div className={styles.usageEmpty}>
          <span className={styles.usageEmptyTitle}>
            {usage?.status === 'unavailable'
              ? t('usageGemini.unavailableTitle')
              : t('usageGemini.noHistoryTitle')}
          </span>
          <span className={styles.usageEmptyHint}>{t('usageGemini.noHistoryHint')}</span>
          <span className={styles.usageEmptyHint}>{t('usageGemini.accountLimitations')}</span>
        </div>
      </div>
    )
  }

  const formatTokens = (value: number) => new Intl.NumberFormat(getLocale()).format(value)
  const models = usage.by_model.slice(0, 3)
  return (
    <div className={styles.usageCard}>
      {head}
      <div className={styles.hero}>
        <div>
          <div className={styles.heroNumWrap}>
            <span className={styles.heroNum}>{formatTokens(usage.total_tokens)}</span>
            <span className={styles.heroDen}>{t('usageGemini.tokens')}</span>
          </div>
          <div className={styles.heroSub}>
            {t('usageGemini.periodSummary', {
              days: usage.period_days,
              requests: formatTokens(usage.requests),
              sessions: formatTokens(usage.session_count),
            })}
          </div>
        </div>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.meterList}>
          {models.map((model) => (
            <Meter
              key={model.model}
              label={model.model}
              value={formatTokens(model.total_tokens)}
              util={(model.total_tokens / usage.total_tokens) * 100}
              base={accent}
            />
          ))}
        </div>
        <div className={styles.statGrid}>
          <StatCell label={t('usageGemini.inputTokens')} value={formatTokens(usage.input_tokens)} />
          <StatCell label={t('usageGemini.outputTokens')} value={formatTokens(usage.output_tokens)} />
          <StatCell label={t('usageGemini.requests')} value={formatTokens(usage.requests)} />
          <StatCell label={t('usageGemini.sessions')} value={formatTokens(usage.session_count)} />
        </div>
      </div>
      <CardFoot
        accent={accent}
        left={t('usageGemini.localHistory')}
        right={t('usageGemini.lastDays', { days: usage.period_days })}
      />
    </div>
  )
}

export function UsageStrip({
  showActivity = true,
  showResetCreditAction = false,
}: {
  showActivity?: boolean
  showResetCreditAction?: boolean
}) {
  const t = useT()
  const claudeUsage = useUiStore((s) => s.claudeUsage)
  const codexUsage = useUiStore((s) => s.codexUsage)
  const antigravityUsage = useUiStore((s) => s.antigravityUsage)
  const copilotUsage = useUiStore((s) => s.copilotUsage)
  const showClaude = useProjectsStore((s) => s.preferences.usageShowClaude)
  const showCodex = useProjectsStore((s) => s.preferences.usageShowCodex)
  const showAntigravity = useProjectsStore((s) => s.preferences.usageShowAntigravity)
  const showCopilot = useProjectsStore((s) => s.preferences.usageShowCopilot !== false)
  const showGemini = useProjectsStore((s) => s.preferences.usageShowGemini !== false)

  if (!showClaude && !showCodex && !showAntigravity && !showCopilot && !showGemini) {
    return (
      <div className={`${styles.usageStrip} ${showActivity ? '' : styles.usageStripTwo}`}>
        <div className={styles.usageEmpty}>{t('usageModal.allHidden')}</div>
      </div>
    )
  }

  return (
    <div className={`${styles.usageStrip} ${showActivity ? '' : styles.usageStripTwo}`}>
      {showClaude ? <ClaudeCard usage={claudeUsage} /> : null}
      {showCodex ? (
        <CodexCard usage={codexUsage} showResetCreditAction={showResetCreditAction} />
      ) : null}
      {showAntigravity ? <AntigravityCard usage={antigravityUsage} /> : null}
      {showCopilot ? <CopilotCard usage={copilotUsage} /> : null}
      {showGemini ? <GeminiCard /> : null}
      {showActivity ? <ActivityGraph className={styles.activityFullRow} /> : null}
    </div>
  )
}
