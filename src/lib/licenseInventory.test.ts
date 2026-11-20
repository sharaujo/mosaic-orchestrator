// @vitest-environment node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const lock = JSON.parse(read('package-lock.json'))
const inventory = JSON.parse(read('THIRD_PARTY_LICENSES/inventory.json'))
const inventoryPlatform = process.platform === 'win32' && process.arch === 'x64'

describe('npm license evidence provenance', () => {
  it('excludes copyright icons and license-update build utilities while retaining legal notices', () => {
    for (const name of ['lucide-react', 'cytoscape']) {
      const entry = inventory.npm.find((item: { name: string }) => item.name === name)
      expect(entry.legalFiles.some((file: { path: string }) => /licen[sc]e/i.test(file.path))).toBe(
        true,
      )
      expect(
        entry.legalFiles.some((file: { path: string }) =>
          /copyright\.js(?:\.map)?$|license-update\.mjs$/i.test(file.path),
        ),
      ).toBe(false)
    }
    const jszip = inventory.npm.find((item: { name: string }) => item.name === 'jszip')
    expect(
      jszip.legalFiles.some((file: { path: string }) => file.path === 'lib/license_header.js'),
    ).toBe(true)
  })

  it('agrees with every installed locked package, including nested resolutions', () => {
    const mismatches: string[] = []
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (!path || !existsSync(resolve(root, path, 'package.json'))) continue
      const installed = JSON.parse(read(`${path}/package.json`))
      const expected = (entry as { version: string }).version
      if (installed.version !== expected)
        mismatches.push(`${path}: ${installed.version} != ${expected}`)
    }
    expect(mismatches).toEqual([])
  })

  it('distinguishes filesystem versions from uninstalled lock targets', () => {
    expect(inventory.schema).toBe(3)
    for (const entry of inventory.npm) {
      const path = `${entry.path}/package.json`
      expect(entry.lockVersion).toBe(lock.packages[entry.path].version)
      if (existsSync(resolve(root, path))) {
        const installed = JSON.parse(read(path))
        expect(installed.version, entry.path).toBe(entry.lockVersion)
        if (inventoryPlatform) {
          expect(entry.installed, entry.path).toBe(true)
          expect(entry.versionSource, entry.path).toBe('installed-manifest')
          expect(entry.installedVersion, entry.path).toBe(installed.version)
          expect(entry.version, entry.path).toBe(installed.version)
        }
      } else if (inventoryPlatform) {
        expect(entry.installed, entry.path).toBe(false)
        expect(entry.versionSource, entry.path).toBe('lockfile-only')
        expect(entry.installedVersion, entry.path).toBe(null)
        expect(entry.legalFiles, entry.path).toEqual([])
      }
      // Other-platform optional installations do not rewrite the Windows snapshot.
      expect(entry.version).toBe(entry.installedVersion ?? entry.lockVersion)
    }
  })

  it('records legal text hashes from installed files without fabricating package metadata', () => {
    const entry = inventory.npm.find((item: { name: string }) => item.name === 'khroma')
    expect(entry.licenseSource).toBe('installed-license-file')
    expect(JSON.parse(read(`${entry.path}/package.json`)).license).toBeUndefined()
    for (const file of entry.legalFiles) {
      const hash = createHash('sha256')
        .update(read(`${entry.path}/${file.path}`).replaceAll('\r\n', '\n'))
        .digest('hex')
      expect(file.sha256).toBe(hash)
    }
  })
})
