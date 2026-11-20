// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { inflateRawSync } from 'node:zlib'

import { afterEach, describe, expect, it } from 'vitest'

import {
  licenseInputDigest,
  prepareSource,
  sha256,
  validateDistribution,
  walkFiles,
  zipFiles,
} from '../../scripts/license-distribution.mjs'
import { rebuildSourceSnapshot } from '../../scripts/license-source-snapshot.mjs'

const temporary: string[] = []
const profile = 'x86_64-pc-windows-msvc'
const lockFixture = '{"version":"1.7.5","packages":{"":{"version":"1.7.5"}}}\n'
const ids = [
  'mosaico',
  'sherpa',
  'onnxruntime',
  'utf8proc',
  'fbank',
  'eigen',
  'fonts',
  'webview2',
  'nsis',
  'wix',
  'msvc',
]
const write = (root: string, path: string, body: string | Buffer) => {
  const destination = join(root, path)
  mkdirSync(resolve(destination, '..'), { recursive: true })
  writeFileSync(destination, body)
}
const readJson = (root: string, path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'))
const normalizedHash = (root: string, path: string) =>
  sha256(readFileSync(join(root, path), 'utf8').replaceAll('\r\n', '\n'))

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mosaico-license-test-'))
  temporary.push(root)
  write(root, 'package.json', '{"version":"1.7.5"}\n')
  write(root, 'package-lock.json', lockFixture)
  write(
    root,
    'src-tauri/Cargo.toml',
    '[package]\nname = "mosaico"\nversion = "1.7.5"\n[dependencies]\nsherpa-onnx = "=2.0.1"\n',
  )
  write(
    root,
    'src-tauri/Cargo.lock',
    '[[package]]\nname = "mosaico"\nversion = "1.7.5"\n[[package]]\nname = "sherpa-onnx"\nversion = "2.0.1"\n[[package]]\nname = "sherpa-onnx-sys"\nversion = "2.0.1"\n',
  )
  write(root, 'src-tauri/tauri.conf.json', '{"bundle":{}}\n')
  write(
    root,
    'src-tauri/tauri.release.json',
    JSON.stringify({
      bundle: {
        licenseFile: '../THIRD_PARTY_LICENSES/WINDOWS-TERMS.rtf',
        resources: {
          '../THIRD-PARTY-NOTICES.md': 'THIRD-PARTY-NOTICES.md',
          '../THIRD_PARTY_LICENSES/': 'THIRD_PARTY_LICENSES/',
          'target/license-source/mosaico-source.zip':
            'THIRD_PARTY_LICENSES/sources/mosaico-source.zip',
        },
      },
    }),
  )
  write(root, 'THIRD-PARTY-NOTICES.md', 'Fixture notices\n')
  write(root, 'THIRD_PARTY_LICENSES/LICENSE.txt', 'Fixture original legal text\n')
  write(root, 'THIRD_PARTY_LICENSES/provenance.json', '[]\n')
  write(
    root,
    'THIRD_PARTY_LICENSES/covered-source.zip',
    zipFiles([{ path: 'source.txt', data: Buffer.from('Covered source\n') }]),
  )
  write(
    root,
    'THIRD_PARTY_LICENSES/components.json',
    JSON.stringify({
      nativeGeneration: 'sherpa-onnx-2.0.1-win-x64-static-MT-Release-lib',
      onnxruntime: '1.28.2',
      components: ids.map((id) => ({
        id,
        name: id,
        status: id === 'eigen' ? 'NEEDS SOURCE NOTICE' : 'CLEAR WITH NOTICE',
        redistributed: true,
        legalFiles: ['LICENSE.txt'],
        sourceFiles: id === 'eigen' ? ['covered-source.zip'] : [],
      })),
    }),
  )
  write(root, '.gitignore', '.env\nsrc-tauri/target/\n')
  write(root, 'hello.rs', 'fn main() {}\n')
  write(root, '.env', 'PRIVATE_FIXTURE=must-not-be-archived\n')
  refresh(root)
  return root
}

function refresh(root: string, records: { npm?: object[]; rust?: object[] } = {}) {
  const directory = join(root, 'THIRD_PARTY_LICENSES')
  const inputs = [
    'package-lock.json',
    'src-tauri/Cargo.lock',
    'src-tauri/Cargo.toml',
    'THIRD_PARTY_LICENSES/components.json',
  ]
  write(
    root,
    'THIRD_PARTY_LICENSES/inventory.json',
    JSON.stringify({
      schema: 3,
      target: profile,
      inputs: Object.fromEntries(inputs.map((path) => [path, licenseInputDigest(root, path)])),
      npm: records.npm ?? [],
      rust: records.rust ?? [],
    }),
  )
  const files = walkFiles(directory)
    .filter((path: string) => !path.endsWith('distribution.json'))
    .map((path: string) => ({
      path: path.slice(directory.length + 1).replaceAll('\\', '/'),
      sha256: path.endsWith('.zip')
        ? sha256(readFileSync(path))
        : sha256(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')),
    }))
  write(
    root,
    'THIRD_PARTY_LICENSES/distribution.json',
    JSON.stringify({
      schema: 1,
      target: profile,
      noticeSHA256: normalizedHash(root, 'THIRD-PARTY-NOTICES.md'),
      packages: [],
      files,
    }),
  )
}

describe('Windows legal distribution gates', () => {
  it('reproduces reviewed upstream source bytes while excluding unrelated binary fixtures', () => {
    const entries = [
      { path: 'upstream/LICENSE.TXT', data: Buffer.from('Original terms\n') },
      { path: 'upstream/src/helper.cpp', data: Buffer.from('Unmodified source\r\n') },
      { path: 'upstream/test/fixture.exe', data: Buffer.from('Unneeded executable fixture') },
    ]
    const upstream = zipFiles(entries)
    const selected = entries.slice(0, 2)
    const expected = zipFiles(selected)
    const profile = {
      upstream: { sha256: sha256(upstream) },
      archiveSHA256: sha256(expected),
      files: selected.map((file) => ({ path: file.path, sha256: sha256(file.data) })),
    }
    expect(rebuildSourceSnapshot(upstream, profile).equals(expected)).toBe(true)
    expect(() => rebuildSourceSnapshot(Buffer.from('wrong archive'), profile)).toThrow(
      'Upstream source digest mismatch',
    )
    profile.files.push({ path: entries[2].path, sha256: sha256(entries[2].data) })
    expect(() => rebuildSourceSnapshot(upstream, profile)).toThrow('not source')
  })

  it('validates versioned legal resources without package-manager or native-build caches', () => {
    expect(validateDistribution(fixture()).manifest.files.length).toBeGreaterThan(0)
  })

  it('rejects stale lock metadata and changed or missing original notices', () => {
    const root = fixture()
    write(root, 'package-lock.json', '{"changed":true}\n')
    expect(() => validateDistribution(root)).toThrow('Stale license input')
    write(root, 'package-lock.json', lockFixture)
    write(root, 'THIRD_PARTY_LICENSES/LICENSE.txt', 'Changed legal text\n')
    expect(() => validateDistribution(root)).toThrow('Legal resource changed')
    rmSync(join(root, 'THIRD_PARTY_LICENSES/LICENSE.txt'))
    expect(() => validateDistribution(root)).toThrow('missing legal resource')
  })

  it('rejects a missing source archive and an unresolved component decision', () => {
    const root = fixture()
    rmSync(join(root, 'THIRD_PARTY_LICENSES/covered-source.zip'))
    expect(() => validateDistribution(root)).toThrow()
    write(root, 'THIRD_PARTY_LICENSES/covered-source.zip', zipFiles([]))
    const path = 'THIRD_PARTY_LICENSES/components.json'
    const data = readJson(root, path)
    data.components[0].status = 'UNKNOWN'
    write(root, path, JSON.stringify(data))
    refresh(root)
    expect(() => validateDistribution(root)).toThrow('Unresolved component')
  })

  it('rejects the removed eSpeak generation even when resource hashes were refreshed', () => {
    const root = fixture(),
      path = 'THIRD_PARTY_LICENSES/components.json'
    const data = readJson(root, path)
    data.components.push({
      id: 'espeak-ng',
      name: 'eSpeak',
      status: 'CLEAR WITH NOTICE',
      redistributed: true,
      legalFiles: ['LICENSE.txt'],
    })
    write(root, path, JSON.stringify(data))
    refresh(root)
    expect(() => validateDistribution(root)).toThrow('Removed native dependency')
  })

  it('requires release-profile mapping into the installed legal directories', () => {
    const root = fixture(),
      path = 'src-tauri/tauri.release.json'
    const config = readJson(root, path)
    delete config.bundle.resources['../THIRD_PARTY_LICENSES/']
    write(root, path, JSON.stringify(config))
    expect(() => validateDistribution(root)).toThrow('Legal directory is not mapped')
  })

  it('allows a normal own-version release bump while rejecting a dependency change', () => {
    const root = fixture()
    write(root, 'package.json', '{"version":"1.7.6"}\n')
    write(root, 'package-lock.json', lockFixture.replaceAll('1.7.5', '1.7.6'))
    for (const path of ['src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'])
      write(root, path, readFileSync(join(root, path), 'utf8').replaceAll('1.7.5', '1.7.6'))
    expect(() => validateDistribution(root)).not.toThrow()
    write(
      root,
      'src-tauri/Cargo.toml',
      readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8').replace('=2.0.1', '=2.0.2'),
    )
    expect(() => validateDistribution(root)).toThrow('Stale license input')
  })

  it('fails closed on new reciprocal runtime obligations instead of just copying a license label', () => {
    const root = fixture()
    refresh(root, {
      rust: [
        {
          ecosystem: 'cargo',
          name: 'new-library',
          version: '1.0.0',
          category: 'B',
          license: 'GPL-3.0-only',
        },
      ],
    })
    expect(() => validateDistribution(root)).toThrow('reviewed source arrangement')
    refresh(root, {
      rust: [
        {
          ecosystem: 'cargo',
          name: 'new-library',
          version: '1.0.0',
          category: 'B',
          license: 'MPL-2.0',
        },
      ],
    })
    expect(() => validateDistribution(root)).toThrow('Missing exact MPL source')
  })

  it('rejects unresolved dependency metadata in the offline CI check', () => {
    const root = fixture()
    refresh(root, {
      npm: [
        {
          ecosystem: 'npm',
          name: 'unreviewed-package',
          version: '1.0.0',
          category: 'B',
          status: 'UNKNOWN',
        },
      ],
    })
    expect(() => validateDistribution(root)).toThrow('Unresolved dependency decision')
  })

  it('writes deterministic ZIP entries with their original Unicode names and contents', () => {
    const data = Buffer.from('Source with an original copyright notice.\n')
    const files = [{ path: 'source/ação.txt', data }]
    const archive = zipFiles(files)
    expect(archive.equals(zipFiles(files))).toBe(true)
    expect(archive.readUInt32LE(0)).toBe(0x04034b50)
    const size = archive.readUInt32LE(18),
      length = archive.readUInt16LE(26)
    expect(archive.subarray(30, 30 + length).toString('utf8')).toBe('source/ação.txt')
    expect(inflateRawSync(archive.subarray(30 + length, 30 + length + size)).equals(data)).toBe(
      true,
    )
    expect(() => zipFiles([{ path: '../escape', data }])).toThrow('Unsafe ZIP member')
  })

  it('delivers repeatable source without ignored credentials or private Git access', () => {
    const root = fixture()
    execFileSync('git', ['init', '-q'], { cwd: root })
    execFileSync('git', ['add', '.'], { cwd: root })
    const first = prepareSource(root)
    expect(prepareSource(root).sha256).toBe(first.sha256)
    write(
      root,
      'src-tauri/Cargo.toml',
      readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8').replaceAll('\n', '\r\n'),
    )
    expect(prepareSource(root).sha256).toBe(first.sha256)
    const receipt = readJson(root, 'src-tauri/target/license-source/source-manifest.json')
    expect(receipt.files.some((file: { path: string }) => file.path === 'hello.rs')).toBe(true)
    expect(receipt.files.some((file: { path: string }) => file.path === '.env')).toBe(false)
    expect(
      receipt.files.some((file: { path: string }) => file.path.startsWith('src-tauri/target/')),
    ).toBe(false)
    rmSync(join(root, '.git'), { recursive: true, force: true })
    write(
      root,
      'SOURCE-MANIFEST.json',
      JSON.stringify({ schema: 1, version: '1.7.5', files: receipt.files }),
    )
    expect(existsSync(join(root, '.git'))).toBe(false)
    expect(prepareSource(root).sha256).toBe(first.sha256)
  })
})
