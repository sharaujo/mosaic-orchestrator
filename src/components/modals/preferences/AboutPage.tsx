import { getVersion } from '@tauri-apps/api/app'
import { useEffect, useState } from 'react'

import { useT } from '../../../lib/i18n'
import { openInBrowser } from '../../../lib/tauri'
import controls from '../controls.module.css'
import styles from '../PreferencesModal.module.css'
import { SettingsSection } from './primitives'

export function AboutPage() {
  const t = useT()
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'none' | 'current' | 'available' | 'unavailable'>('idle')
  const [releaseUrl, setReleaseUrl] = useState('')

  const checkUpdates = async () => {
    setChecking(true)
    try {
      const response = await fetch('https://api.github.com/repos/SHARAUJO/mosaic-orchestrator/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' },
      })
      if (response.status === 404) {
        setUpdateStatus('none')
        return
      }
      if (!response.ok) throw new Error(`GitHub releases: ${response.status}`)
      const release = await response.json() as { tag_name?: string; html_url?: string }
      const current = version.split('.').map(Number)
      const latest = (release.tag_name ?? '').replace(/^v/, '').split('.').map(Number)
      const newer = latest.length >= 3 && latest.some((part, index) =>
        part > (current[index] ?? 0) && latest.slice(0, index).every((earlier, i) => earlier === (current[i] ?? 0)),
      )
      setReleaseUrl(release.html_url ?? '')
      setUpdateStatus(newer ? 'available' : 'current')
    } catch {
      setUpdateStatus('unavailable')
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion(''))
  }, [])

  return (
    <>
      <SettingsSection
        id="app-version"
        title={t('prefs.aboutVersionTitle')}
        description={t('prefs.aboutVersionDesc')}
      >
        <div className={styles.versionCard}>
          <div className={styles.versionCardCopy}>
            <strong>{t('brand.name')}</strong>
            <span>com.mosaico.agents</span>
          </div>
          <span className={styles.versionCardNumber}>{version ? `v${version}` : '—'}</span>
        </div>
      </SettingsSection>

      <SettingsSection
        id="app-updates"
        title={t('prefs.aboutUpdatesTitle')}
        description={t('prefs.aboutUpdatesDesc')}
      >
        <p className={styles.updateCheckedNote}>{t(updateStatus === 'idle' ? 'prefs.aboutUpdatesIdle' : updateStatus === 'none' ? 'prefs.aboutUpdatesNoRelease' : updateStatus === 'current' ? 'prefs.aboutUpdatesCurrent' : updateStatus === 'available' ? 'prefs.aboutUpdatesAvailable' : 'prefs.aboutUpdatesUnavailable')}</p>
        <button type="button" className={controls.btn} disabled={checking || !version} onClick={() => void checkUpdates()}>
          {checking ? t('prefs.aboutUpdatesChecking') : t('prefs.aboutUpdatesCheck')}
        </button>
        {updateStatus === 'available' && releaseUrl ? (
          <button type="button" className={controls.btn} onClick={() => void openInBrowser(releaseUrl)}>
            {t('prefs.aboutUpdatesOpenRelease')}
          </button>
        ) : null}
      </SettingsSection>
    </>
  )
}
