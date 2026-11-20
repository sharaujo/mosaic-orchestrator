import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import packageInfo from '../../package.json'
import config from '../../src-tauri/tauri.conf.json'
import { CHANGELOG_RELEASES, CURRENT_VERSION } from './changelogData'

describe('release identity', () => {
  it('keeps frontend, installer, Rust and current notes on the same release', () => {
    expect(CURRENT_VERSION).toBe(packageInfo.version)
    expect(config.version).toBe(CURRENT_VERSION)
    expect(CHANGELOG_RELEASES[0].version).toBe(CURRENT_VERSION)
    expect(readFileSync('src-tauri/Cargo.toml', 'utf8')).toContain(`version = "${CURRENT_VERSION}"`)
  })
})
