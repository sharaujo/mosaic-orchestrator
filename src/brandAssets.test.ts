// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import ledger from '../docs/brand-assets.json'

describe('visual asset provenance', () => {
  it('keeps project provenance usable independently of repository history', () => {
    expect(ledger.schemaVersion).toBe(2)
    expect(ledger.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    for (const group of Object.values(ledger.groups)) {
      const url = new URL(group.officialUrl)
      if (
        url.hostname === 'github.com' &&
        url.pathname.toLowerCase().startsWith('/sharaujo/mosaic-orchestrator')
      ) {
        expect(url.pathname).toMatch(/^\/sharaujo\/mosaic-orchestrator(?:\/blob\/main\/[^?#]+)?$/i)
        if ('sourcePath' in group) {
          expect(existsSync(group.sourcePath)).toBe(true)
          expect(url.pathname.endsWith(`/main/${group.sourcePath}`)).toBe(true)
        }
      }
    }
    // Removal records retain content identity and decisions, not commit locators.
    const records = [ledger, ...Object.values(ledger.groups), ...ledger.removed]
    for (const record of records) {
      expect(record).not.toHaveProperty('baseRevision')
      expect(record).not.toHaveProperty('introducedAt')
      expect(record).not.toHaveProperty('historicalSourceExposure')
    }
  })

  it('accounts for every versioned image and font, including source-only assets', () => {
    const paths: string[] = existsSync('.git')
      ? execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
          encoding: 'utf8',
        }).split('\0')
      : JSON.parse(readFileSync('SOURCE-MANIFEST.json', 'utf8')).files.map(
          (file: { path: string }) => file.path,
        )
    const assets = [...new Set(paths)].filter(
      (path) =>
        /\.(?:svg|png|ico|icns|bmp|jpg|jpeg|webp|gif|ttf|otf|woff2?)$/i.test(path) &&
        existsSync(path),
    )
    expect(assets.sort()).toEqual(ledger.retained.map((asset) => asset.path).sort())
    for (const asset of ledger.retained) {
      // Git checkouts can change SVG line endings without changing the artwork.
      const bytes = asset.path.endsWith('.svg')
        ? readFileSync(asset.path, 'utf8').replace(/\r\n/g, '\n')
        : readFileSync(asset.path)
      const digest = createHash('sha256').update(bytes).digest('hex')
      expect(digest, asset.path).toBe(asset.sha256)
      const group = ledger.groups[asset.group as keyof typeof ledger.groups]
      expect(group.officialUrl).toMatch(/^https:\/\//)
      expect(['CLEAR', 'PERMITTED WITH CONDITIONS', 'ATTRIBUTION REQUIRED']).toContain(
        group.classification,
      )
      expect(group.license).not.toBe('')
      expect(group.trademarkGuidance).not.toBe('')
      expect(group.attribution).not.toBe('')
    }
  })

  it('excludes retired artwork from source files and Rust remote embedding', () => {
    for (const asset of ledger.removed) expect(existsSync(asset.path), asset.path).toBe(false)
    const desktop = readFileSync('src/components/icons/AgentIcons.tsx', 'utf8')
    const remote = readFileSync('src-tauri/remote/app.js', 'utf8')
    const backend = readFileSync('src-tauri/src/remote/http.rs', 'utf8')
    expect(desktop).not.toMatch(/assets\/|primer\/octicons|cube mark|Kimi Code mark/)
    expect(remote).not.toContain('/assets/agents/')
    expect(backend).not.toContain('/assets/agents/')
  })
})
