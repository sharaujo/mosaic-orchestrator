import packageInfo from '../../package.json'
import type { MessageKey } from './i18n'

export type ChangelogRelease = {
  version: string
  date: string
  noteKeys: MessageKey[]
}

export const CURRENT_VERSION = packageInfo.version
export const CHANGELOG_RELEASES: ChangelogRelease[] = [
  { version: '1.7.5', date: '2026-10-06T22:00:00Z', noteKeys: [] },
  { version: '1.7.4', date: '2026-10-06T12:00:00Z', noteKeys: [] },
  { version: '1.7.3', date: '2026-10-05T21:50:00Z', noteKeys: ['whatsNew.m173'] },
  { version: '1.7.2', date: '2026-10-05T20:30:00Z', noteKeys: ['whatsNew.m172'] },
  { version: '1.7.1', date: '2026-10-05T20:00:00Z', noteKeys: ['whatsNew.m171'] },
  { version: '1.7.0', date: '2026-10-05T19:00:00Z', noteKeys: ['whatsNew.m170'] },
  { version: '1.6.0', date: '2026-10-05T12:00:00Z', noteKeys: ['whatsNew.m160'] },
  { version: '1.4.1', date: '2026-10-05T12:00:00Z', noteKeys: ['whatsNew.m141'] },
  { version: '1.4.0', date: '2026-10-04T12:00:00Z', noteKeys: ['whatsNew.m140'] },
  { version: '1.3.1', date: '2026-10-04T12:00:00Z', noteKeys: ['whatsNew.m131'] },
]
