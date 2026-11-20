import { useEffect } from 'react'

import { useT } from '../lib/i18n'
import { clearDiscordPresence, setDiscordPresence } from '../lib/tauri'
import { useProjectsStore } from '../stores/projectsStore'
import { useUiStore } from '../stores/uiStore'

const STARTED_AT = Math.floor(Date.now() / 1000)
const REFRESH_INTERVAL_MS = 30_000

const VIEW_LABELS = {
  home: 'Viewing the dashboard',
  workspace: 'Managing terminals',
  agentCanvas: 'Orchestrating AI agents',
  agentSandbox: 'Testing agent orchestration',
} as const

export function useDiscordPresence() {
  const t = useT()
  const hydrated = useProjectsStore((store) => store.hydrated)
  const enabled = useProjectsStore((store) => store.preferences.discordRichPresenceEnabled)
  const applicationId = useProjectsStore((store) => store.preferences.discordApplicationId)
  const activeView = useUiStore((store) => store.activeView)

  useEffect(() => {
    if (!hydrated) return

    if (!enabled) {
      void clearDiscordPresence().catch(() => undefined)
      return
    }

    const update = () => {
      const detail = activeView === 'kanban' ? t('kanban.presence') : VIEW_LABELS[activeView]
      void setDiscordPresence('Working with mosAIco', detail, STARTED_AT, applicationId).catch(
        () => undefined,
      )
    }

    update()
    const interval = window.setInterval(update, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [activeView, applicationId, enabled, hydrated, t])
}
