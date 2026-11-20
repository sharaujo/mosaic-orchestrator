import { useState } from 'react'

import { agentLabel, resolveAgentCliCommand } from '../../lib/agentProviders'
import { useT } from '../../lib/i18n'
import type { AgentType } from '../../lib/types'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import styles from './UsageCosts.module.css'

export function AgentLoginHelp() {
  const t = useT()
  const projects = useProjectsStore((s) => s.projects)
  const enabled = useProjectsStore((s) => s.preferences.enabledAgents)
  const [projectId, setProjectId] = useState('')
  const openModal = useUiStore((s) => s.openModal_)
  const available = projects.filter((p) => !p.archived)
  const selected = available.find((p) => p.id === projectId)?.id ?? available[0]?.id
  const [agent, setAgent] = useState<AgentType>('antigravity')
  return (
    <section className={styles.root}>
      <h3>{t('usageLogin.title')}</h3>
      <p>
        {t('usageLogin.instructions', {
          command: resolveAgentCliCommand(agent) ?? agentLabel(agent),
        })}
      </p>
      <div className={styles.settings}>
        <label>
          {t('usageCosts.agent')}
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            {(['claude', 'codex', 'antigravity', 'copilot', 'gemini'] as const).map((id) => (
              <option key={id} value={id}>
                {agentLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('kanban.projectFilter')}
          <select value={selected ?? ''} onChange={(e) => setProjectId(e.target.value)}>
            <option value="" disabled>
              {t('usageLogin.chooseProject')}
            </option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          onClick={() => {
            if (!selected) {
              openModal('newProject')
              return
            }
            if (enabled[agent] === false)
              useProjectsStore
                .getState()
                .setPreferences({ enabledAgents: { ...enabled, [agent]: true } })
            openModal('newTerminal', { projectId: selected, only: [agent] })
          }}
        >
          {selected ? t('usageLogin.open') : t('usageLogin.createProject')}
        </button>
      </div>
    </section>
  )
}
