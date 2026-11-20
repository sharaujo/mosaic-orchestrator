import { Check, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { getCachedAntigravityUsage } from '../../lib/antigravityUsageCache'
import { getCachedClaudeUsage } from '../../lib/claudeUsageCache'
import { getCachedCodexUsage } from '../../lib/codexUsageCache'
import { useT } from '../../lib/i18n'
import { AGENT_TYPE_LABELS } from '../../lib/types'
import { USAGE_PROVIDERS } from '../../lib/usageProviders'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import { ActivityGraph } from '../HomeView/ActivityGraph'
import { TimeAnalytics } from '../HomeView/TimeAnalytics'
import { UsageStrip } from '../HomeView/UsageStrip'
import { AgentIcon } from '../icons/AgentIcons'
import { AgentLoginHelp } from './AgentLoginHelp'
import styles from './AiUsageModal.module.css'
import { Modal } from './Modal'
import { UsageCosts } from './UsageCosts'

function VisibilitySwitch({
  checked,
  onToggle,
  disabled = false,
  title,
}: {
  checked: boolean
  onToggle?: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-on={checked ? 'true' : 'false'}
      className={styles.switch}
      onClick={onToggle}
      disabled={disabled}
      title={title}
    >
      <span className={styles.switchKnob}>{checked ? <Check size={11} /> : null}</span>
    </button>
  )
}

function UsageVisibilityEditor() {
  const t = useT()
  const preferences = useProjectsStore((state) => state.preferences)
  const setPreferences = useProjectsStore((state) => state.setPreferences)

  return (
    <div className={styles.customizePanel}>
      <div className={`${styles.customizeRow} ${styles.customizeRowHead}`}>
        <span className={styles.customizeName} />
        <span className={styles.customizeToggleLabel}>{t('usageModal.showInUsagePanel')}</span>
        <span className={styles.customizeToggleLabel}>{t('usageModal.showInTopbar')}</span>
      </div>
      <div className={styles.customizeRow}>
        <span className={styles.customizeName}>
          <AgentIcon type="copilot" size={16} theme={preferences.uiTheme} />
          {t('usageCopilot.label')}
        </span>
        <input
          type="checkbox"
          checked={preferences.usageShowCopilot !== false}
          onChange={(e) => setPreferences({ usageShowCopilot: e.target.checked })}
          aria-label={t('usageModal.showInUsagePanel')}
        />
        <VisibilitySwitch
          checked={preferences.topbarShowCopilotUsage}
          onToggle={() =>
            setPreferences({ topbarShowCopilotUsage: !preferences.topbarShowCopilotUsage })
          }
        />
      </div>
      <div className={styles.customizeRow}>
        <span className={styles.customizeName}>
          <AgentIcon type="gemini" size={16} theme={preferences.uiTheme} />
          {t('usageGemini.label')}
        </span>
        <input
          type="checkbox"
          checked={preferences.usageShowGemini !== false}
          onChange={(e) => setPreferences({ usageShowGemini: e.target.checked })}
          aria-label={t('usageModal.showInUsagePanel')}
        />
        <VisibilitySwitch
          checked={preferences.topbarShowGeminiUsage}
          disabled
          title={t('usageGemini.topbarUnavailable')}
        />
      </div>
      {USAGE_PROVIDERS.map((provider) => {
        const usageOn = preferences[provider.usagePrefKey]
        const topbarOn = preferences[provider.topbarPrefKey]
        return (
          <div key={provider.id} className={styles.customizeRow}>
            <span className={styles.customizeName}>
              <AgentIcon type={provider.agentType} size={16} theme={preferences.uiTheme} />
              {AGENT_TYPE_LABELS[provider.agentType]}
            </span>
            <VisibilitySwitch
              checked={usageOn}
              onToggle={() => setPreferences({ [provider.usagePrefKey]: !usageOn })}
            />
            <VisibilitySwitch
              checked={topbarOn}
              onToggle={() => setPreferences({ [provider.topbarPrefKey]: !topbarOn })}
            />
          </div>
        )
      })}
    </div>
  )
}

export function AiUsageModal() {
  const t = useT()
  const open = useUiStore((state) => state.openModal === 'aiUsage')
  const closeModal = useUiStore((state) => state.closeModal)
  const setClaudeUsage = useUiStore((state) => state.setClaudeUsage)
  const setCodexUsage = useUiStore((state) => state.setCodexUsage)
  const setAntigravityUsage = useUiStore((state) => state.setAntigravityUsage)
  const [editing, setEditing] = useState(false)
  const [section, setSection] = useState<'account' | 'local' | 'history' | 'costs'>('account')
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!open || section !== 'account') return
    setRefreshing(true)
    let cancelled = false
    void Promise.allSettled([
      getCachedClaudeUsage(true),
      getCachedCodexUsage(true),
      getCachedAntigravityUsage(true),
    ]).then(([claude, codex, antigravity]) => {
      if (cancelled) return
      setCheckedAt(Date.now())
      setRefreshing(false)
      setClaudeUsage(claude.status === 'fulfilled' ? claude.value : null)
      setCodexUsage(codex.status === 'fulfilled' ? codex.value : null)
      setAntigravityUsage(antigravity.status === 'fulfilled' ? antigravity.value : null)
    })
    return () => {
      cancelled = true
    }
  }, [open, section, revision, setAntigravityUsage, setClaudeUsage, setCodexUsage])

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title={t('usageModal.title')}
      width={920}
      headerAction={
        <button
          type="button"
          className={`${styles.customizeButton} ${editing ? styles.customizeButtonActive : ''}`}
          aria-label={t('usageModal.customize')}
          aria-pressed={editing}
          onClick={() => setEditing((value) => !value)}
        >
          <Settings2 size={15} />
        </button>
      }
    >
      <p className={styles.description}>{t('usageModal.description')}</p>
      {editing ? <UsageVisibilityEditor /> : null}
      <div className={styles.sections} role="group" aria-label={t('usageModal.title')}>
        {(['account', 'local', 'history', 'costs'] as const).map((id) => (
          <button
            type="button"
            key={id}
            aria-pressed={section === id}
            onClick={() => setSection(id)}
          >
            {t(`usageSections.${id}`)}
          </button>
        ))}
      </div>
      {open && section === 'account' ? (
        <>
          <p className={styles.description}>{t('usageSections.accountHint')}</p>
          <div className={styles.sections}>
            <button type="button" disabled={refreshing} onClick={() => setRevision((v) => v + 1)}>
              {t('widget.refreshUsage')}
            </button>
            <span role="status">
              {refreshing
                ? t('usageCosts.loading')
                : checkedAt
                  ? t('usageCosts.checked', { time: new Date(checkedAt).toLocaleString() })
                  : ''}
            </span>
          </div>
          <UsageStrip showActivity={false} showResetCreditAction />
          <AgentLoginHelp />
        </>
      ) : null}
      {open && section === 'local' ? (
        <>
          <p className={styles.description}>{t('usageSections.localHint')}</p>
          <TimeAnalytics />
        </>
      ) : null}
      {open && section === 'history' ? (
        <>
          <p className={styles.description}>{t('usageSections.historyHint')}</p>
          <ActivityGraph />
        </>
      ) : null}
      {open && section === 'costs' ? <UsageCosts /> : null}
    </Modal>
  )
}
