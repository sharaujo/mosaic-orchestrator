// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  checkVersions,
  nextVersion,
  runRelease,
  withoutRootVersions,
} from '../../scripts/release.mjs'
import { releaseState, validateAssets, workflowRelease } from '../../scripts/release-assets.mjs'

const root = resolve(import.meta.dirname, '../..')
const files = [
  'package.json',
  'package-lock.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
  'src/lib/changelogData.ts',
]
const head = 'a'.repeat(40)
const temps: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const ciRun = {
  id: 99,
  run_attempt: 1,
  head_sha: head,
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
}
const ciJobs = () =>
  ['Frontend (typecheck + build)', 'Rust check (Windows)', 'Rust check (Linux)'].map((name) => ({
    name,
    run_id: 99,
    head_sha: head,
    status: 'completed',
    conclusion: 'success',
  }))

function fixture(overrides: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'mosaico-release-test-'))
  temps.push(cwd)
  for (const file of files) {
    mkdirSync(dirname(join(cwd, file)), { recursive: true })
    copyFileSync(join(root, file), join(cwd, file))
  }
  const calls: string[][] = []
  const logs: string[] = []
  const replies: Record<string, string> = {
    'status --porcelain --untracked-files=all': '',
    'branch --show-current': 'main',
    'remote get-url origin': 'https://github.com/sharaujo/mosaic-orchestrator.git',
    'remote get-url --push origin': 'git@github.com:sharaujo/mosaic-orchestrator.git',
    'rev-parse HEAD': head,
    'rev-parse origin/main': head,
    'ls-remote origin refs/heads/main': `${head}\trefs/heads/main`,
    ...overrides,
  }
  const exec = (command: string, argv: string[]) => {
    calls.push([command, ...argv])
    if (command === process.execPath) {
      return execFileSync(command, argv, { cwd, encoding: 'utf8' }).trim()
    }
    expect(command).toBe('git')
    const key = argv.join(' ')
    if (key in replies) return replies[key]
    if (
      [
        'tag --list ',
        'ls-remote --tags ',
        'ls-remote --heads ',
        'for-each-ref ',
        'switch -c ',
        'add -- ',
        'commit -m ',
        'tag -a ',
        '-c push.followTags=false push ',
      ].some((prefix) => key.startsWith(prefix))
    )
      return ''
    throw new Error(`Unexpected command: ${command} ${key}`)
  }
  const github = async (path: string) =>
    path.includes('/jobs?') ? { total_count: 3, jobs: ciJobs() } : { workflow_runs: [ciRun] }
  const options = {
    cwd,
    exec,
    github,
    log: (line: string) => logs.push(line),
    now: () => new Date('2026-10-22T12:00:00Z'),
  }
  return { cwd, calls, logs, options }
}

describe('protected-main release preparation', () => {
  it('calculates patch 1.7.5 -> 1.7.6 and refuses equal, older, or malformed versions', () => {
    expect(nextVersion('1.7.5', 'patch')).toBe('1.7.6')
    expect(nextVersion('1.7.5', 'minor')).toBe('1.8.0')
    expect(nextVersion('1.7.5', 'major')).toBe('2.0.0')
    for (const value of ['1.7.5', '1.7.4', '01.7.6', 'v1.7.6', 'unknown'])
      expect(() => nextVersion('1.7.5', value)).toThrow()
  })

  it('dry-run describes a release branch and commit without changing files or Git', async () => {
    const { cwd, calls, logs, options } = fixture()
    const before = files.map((file) => readFileSync(join(cwd, file), 'utf8'))
    await runRelease({ ...options, args: ['patch', '--dry-run'] })
    expect(files.map((file) => readFileSync(join(cwd, file), 'utf8'))).toEqual(before)
    expect(logs.join('\n')).toContain('would create branch release/v1.7.6')
    expect(logs.join('\n')).toContain('would commit chore(release): v1.7.6')
    expect(logs.join('\n')).toContain(
      'would update package.json and package-lock.json via npm version',
    )
    expect(calls.some(([, action]) => ['switch', 'add', 'commit', 'push'].includes(action))).toBe(
      false,
    )
    expect(calls.some(([, action, option]) => action === 'tag' && option === '-a')).toBe(false)
  })

  it('uses real offline npm version in a disposable fixture, preserving all dependencies and resolutions', async () => {
    const { cwd, calls, options } = fixture()
    const before = files
      .slice(0, 2)
      .map((file) => JSON.parse(readFileSync(join(cwd, file), 'utf8')))
    await runRelease({ ...options, args: ['patch'] })
    expect(checkVersions(cwd, 'v1.7.6')).toBe('1.7.6')
    for (let i = 0; i < 2; i++) {
      const after = JSON.parse(readFileSync(join(cwd, files[i]), 'utf8'))
      expect(withoutRootVersions(after)).toEqual(withoutRootVersions(before[i]))
    }
    expect(calls).toContainEqual(['git', 'switch', '-c', 'release/v1.7.6'])
    expect(calls.filter(([, action]) => action === 'commit')).toHaveLength(1)
    expect(calls.some(([, action]) => action === 'push')).toBe(false)
    expect(calls.some(([, action, option]) => action === 'tag' && option === '-a')).toBe(false)
    // Git mutations above are recorded by the fake runner, never executed.
    expect(calls.find(([command]) => command === process.execPath)?.slice(2)).toEqual([
      'version',
      '1.7.6',
      '--no-git-tag-version',
      '--ignore-scripts',
      '--offline',
    ])
  })

  it.each([
    { 'branch --show-current': 'feature/test' },
    { 'status --porcelain --untracked-files=all': '?? untracked.txt' },
    { 'rev-parse origin/main': 'b'.repeat(40) },
    { 'ls-remote origin refs/heads/main': `${'b'.repeat(40)}\trefs/heads/main` },
    { 'remote get-url --push origin': 'https://github.com/other/fork.git' },
    { 'for-each-ref --format=%(refname) refs/heads/release/v1.7.6': 'refs/heads/release/v1.7.6' },
    { 'ls-remote --heads origin refs/heads/release/v1.7.6': head },
    { 'tag --list v1.7.6': 'v1.7.6' },
    { 'ls-remote --tags origin refs/tags/v1.7.6': head },
  ])('refuses unsafe preparation before mutations: %j', async (overrides) => {
    const { cwd, options, calls } = fixture(overrides)
    const before = files.map((file) => readFileSync(join(cwd, file), 'utf8'))
    await expect(runRelease({ ...options, args: ['patch'] })).rejects.toThrow()
    expect(files.map((file) => readFileSync(join(cwd, file), 'utf8'))).toEqual(before)
    expect(calls.some(([, action]) => ['switch', 'add', 'commit', 'push'].includes(action))).toBe(
      false,
    )
  })
})

describe('separate tag operation', () => {
  it('creates an annotated tag on the checked main commit and pushes only that explicit ref', async () => {
    const { options, calls } = fixture()
    await runRelease({ ...options, args: ['tag', '1.7.5'] })
    expect(calls).toContainEqual(['git', 'tag', '-a', 'v1.7.5', '-m', 'v1.7.5', head])
    expect(calls).toContainEqual([
      'git',
      '-c',
      'push.followTags=false',
      'push',
      'origin',
      'refs/tags/v1.7.5:refs/tags/v1.7.5',
    ])
    expect(
      calls.some(
        (call) =>
          call.includes('commit') ||
          call.includes('switch') ||
          (call.includes('push') && call.includes('main')),
      ),
    ).toBe(false)
  })

  it('tag dry-run only reports would tag and would push', async () => {
    const { options, calls, logs } = fixture()
    await runRelease({ ...options, args: ['tag', '1.7.5', '--dry-run'] })
    expect(logs.join('\n')).toContain('would tag v1.7.5')
    expect(logs.join('\n')).toContain('would push only v1.7.5')
    expect(calls.some((call) => call.includes('-a') || call.includes('push'))).toBe(false)
  })

  it.each([
    { 'branch --show-current': 'feature/test' },
    { 'status --porcelain --untracked-files=all': ' M package.json' },
    { 'rev-parse origin/main': 'b'.repeat(40) },
    { 'ls-remote origin refs/heads/main': `${'b'.repeat(40)}\trefs/heads/main` },
    { 'tag --list v1.7.5': 'v1.7.5' },
    { 'ls-remote --tags origin refs/tags/v1.7.5': head },
  ])('rejects dirty main and existing local or remote tags: %j', async (overrides) => {
    const { options, calls } = fixture(overrides)
    await expect(runRelease({ ...options, args: ['tag', '1.7.5'] })).rejects.toThrow()
    expect(calls.some((call) => call.includes('-a') || call.includes('push'))).toBe(false)
  })

  it('rejects a requested tag inconsistent with the current version', async () => {
    const { options } = fixture()
    await expect(runRelease({ ...options, args: ['tag', '1.7.6'] })).rejects.toThrow(
      'does not match',
    )
    await expect(runRelease({ ...options, args: ['tag'] })).rejects.toThrow('explicit')
  })

  it('rejects inconsistent package-lock versions', async () => {
    const { cwd, options } = fixture()
    const lock = JSON.parse(readFileSync(join(cwd, 'package-lock.json'), 'utf8'))
    lock.packages[''].version = '1.7.4'
    writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify(lock))
    await expect(runRelease({ ...options, args: ['tag', '1.7.5'] })).rejects.toThrow(
      'Version files disagree',
    )
  })

  it.each(['failure', 'cancelled', null])(
    'rejects main CI that is not green: %s',
    async (conclusion) => {
      const { options, calls } = fixture()
      const github = async () => ({
        workflow_runs: [
          { head_sha: head, head_branch: 'main', event: 'push', status: 'completed', conclusion },
        ],
      })
      await expect(runRelease({ ...options, github, args: ['tag', '1.7.5'] })).rejects.toThrow('CI')
      expect(calls.some((call) => call.includes('-a') || call.includes('push'))).toBe(false)
    },
  )

  it.each([
    { ...ciRun, head_sha: 'b'.repeat(40) },
    { ...ciRun, event: 'pull_request' },
    { ...ciRun, status: 'in_progress' },
    { ...ciRun, id: undefined },
  ])('rejects a wrong-SHA, PR, pending, or unidentifiable CI run: %j', async (run) => {
    const { options, calls } = fixture()
    await expect(
      runRelease({
        ...options,
        github: async () => ({ workflow_runs: [run] }),
        args: ['tag', '1.7.5'],
      }),
    ).rejects.toThrow()
    expect(calls.some((call) => call.includes('-a') || call.includes('push'))).toBe(false)
  })

  it.each([
    'missing',
    'skipped',
    'failure',
    'other-sha',
    'other-run',
    'duplicate',
    'incomplete-response',
  ])('requires every named job on the exact SHA and attempt: %s', async (scenario) => {
    const { options, calls } = fixture()
    const jobs = ciJobs()
    if (scenario === 'missing') jobs.pop()
    if (scenario === 'skipped' || scenario === 'failure') jobs[2].conclusion = scenario
    if (scenario === 'other-sha') jobs[2].head_sha = 'b'.repeat(40)
    if (scenario === 'other-run') jobs[2].run_id = 98
    if (scenario === 'duplicate') jobs.push(jobs[2])
    const github = async (path: string) =>
      path.includes('/jobs?')
        ? { total_count: scenario === 'incomplete-response' ? 101 : jobs.length, jobs }
        : { workflow_runs: [ciRun] }
    await expect(runRelease({ ...options, github, args: ['tag', '1.7.5'] })).rejects.toThrow('CI')
    expect(calls.some((call) => call.includes('-a') || call.includes('push'))).toBe(false)
  })

  it.each(['unauthenticated', 'bad-json', 'empty-response'])(
    'aborts when gh cannot verify private CI: %s',
    async (scenario) => {
      vi.stubEnv('GH_TOKEN', '')
      vi.stubEnv('GITHUB_TOKEN', '')
      const { options, calls } = fixture()
      const exec = (command: string, args: string[]) => {
        if (command === 'gh') {
          if (scenario === 'unauthenticated') throw new Error('gh is not authenticated')
          return scenario === 'bad-json' ? 'not JSON' : '{}'
        }
        return options.exec(command, args)
      }
      await expect(
        runRelease({ ...options, exec, github: undefined, args: ['tag', '1.7.5'] }),
      ).rejects.toThrow()
      expect(calls.some((call) => call.includes('-a') || call.includes('push'))).toBe(false)
    },
  )

  it.each([401, 403, 429, 500, 'network', 'bad-json'])(
    'aborts on token/API failures without tagging: %s',
    async (failure) => {
      vi.stubEnv('GH_TOKEN', 'fixture-token-never-sent')
      const { options, calls } = fixture()
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          if (failure === 'network') throw new Error('Network unavailable')
          if (failure === 'bad-json')
            return {
              ok: true,
              json: async () => {
                throw new SyntaxError('Malformed JSON')
              },
            }
          return { ok: false, status: failure }
        }),
      )
      await expect(
        runRelease({ ...options, github: undefined, args: ['tag', '1.7.5'] }),
      ).rejects.toThrow()
      expect(calls.some((call) => call.includes('-a') || call.includes('push'))).toBe(false)
    },
  )
})

describe('draft asset validation and rerun identity', () => {
  const expected = [
    { name: 'mosAIco_1.7.6_x64-setup.exe', size: 100, sha256: 'a'.repeat(64) },
    { name: 'mosAIco_1.7.6_x64_en-US.msi', size: 200, sha256: 'b'.repeat(64) },
  ]
  const assets = expected.map((file) => ({
    ...file,
    state: 'uploaded',
    digest: `sha256:${file.sha256}`,
  }))

  it('accepts only both uploaded installers matching the current build', () => {
    expect(() => validateAssets(assets, expected, '1.7.6')).not.toThrow()
    expect(() => validateAssets(assets.slice(0, 1), expected, '1.7.6')).toThrow()
    expect(() => validateAssets(assets.slice(1), expected, '1.7.6')).toThrow()
    expect(() => validateAssets([...assets, assets[0]], expected, '1.7.6')).toThrow()
    expect(() => validateAssets(assets, expected, '1.7.7')).toThrow()
    expect(() =>
      validateAssets([{ ...assets[0], size: 0 }, assets[1]], expected, '1.7.6'),
    ).toThrow()
    expect(() =>
      validateAssets([{ ...assets[0], size: 99 }, assets[1]], expected, '1.7.6'),
    ).toThrow()
    expect(() =>
      validateAssets([{ ...assets[0], state: 'starter' }, assets[1]], expected, '1.7.6'),
    ).toThrow()
    expect(() =>
      validateAssets([{ ...assets[0], digest: 'sha256:wrong' }, assets[1]], expected, '1.7.6'),
    ).toThrow()
  })

  it('finds the same draft or published release by exact tag and refuses duplicates', () => {
    const draft = { id: 123, tag_name: 'v1.7.6', draft: true }
    expect(releaseState([draft], 'v1.7.6')).toBe(draft)
    const published = { ...draft, draft: false }
    expect(releaseState([published], 'v1.7.6')).toBe(published)
    expect(releaseState([draft], 'v1.7.7')).toBeUndefined()
    expect(() => releaseState([draft, published], 'v1.7.6')).toThrow('Multiple')
  })
})

describe('workflow draft lifecycle with a simulated GitHub API', () => {
  function workflowFixture(draft: boolean | null = true, includeNotes = true) {
    const { cwd } = fixture()
    const notes = '# Reviewed release notes\n'
    mkdirSync(join(cwd, 'docs/releases'), { recursive: true })
    if (includeNotes) writeFileSync(join(cwd, 'docs/releases/v1.7.5.md'), notes)
    const paths = ['mosAIco_1.7.5_x64-setup.exe', 'mosAIco_1.7.5_x64_en-US.msi'].map((name) =>
      join(cwd, name),
    )
    for (const path of paths) writeFileSync(path, 'installer')
    const calls: string[][] = []
    let release =
      draft === null
        ? undefined
        : { id: 123, tag_name: 'v1.7.5', draft, prerelease: false, body: '' }
    let corruptDownload = false
    let failure = ''
    const exec = (command: string, args: string[]) => {
      calls.push([command, ...args])
      if (command === 'git') {
        if (args[0] === 'cat-file') return 'tag'
        if (args[0] === 'merge-base') return ''
        return head
      }
      expect(command).toBe('gh')
      if (args[0] === 'api') {
        const path = args.at(-1)!
        if (failure === 'api' && path.includes('/assets?'))
          throw new Error('GitHub API unavailable')
        if (path.includes('git/ref/tags/')) return JSON.stringify({ object: { sha: head } })
        if (path.endsWith('releases?per_page=100'))
          return JSON.stringify([release ? [release] : []])
        if (path.includes('/assets?'))
          return JSON.stringify([
            paths.map((path) => ({ name: path.split(/[\\/]/).at(-1), state: 'uploaded', size: 9 })),
          ])
        return JSON.stringify(release)
      }
      if (args[1] === 'create')
        release = { id: 123, tag_name: 'v1.7.5', draft: true, prerelease: false, body: notes }
      if (args[1] === 'download') {
        const name = args[args.indexOf('--pattern') + 1]
        const dest = args[args.indexOf('--dir') + 1]
        writeFileSync(join(dest, name), corruptDownload ? 'corrupted' : 'installer')
      }
      if (args.includes('--notes-file')) {
        if (failure === 'notes') throw new Error('Release notes update failed')
        release = { ...release!, body: notes }
      }
      if (args.includes('--draft=false')) release = { ...release!, draft: false }
      return ''
    }
    const options = {
      cwd,
      exec,
      log: () => {},
      env: {
        GITHUB_REF_NAME: 'v1.7.5',
        GITHUB_REPOSITORY: 'sharaujo/mosaic-orchestrator',
        GITHUB_OUTPUT: join(cwd, 'outputs'),
        RELEASE_ID: '123',
        ARTIFACT_PATHS: JSON.stringify(paths),
      },
    }
    return {
      cwd,
      calls,
      options,
      corrupt: () => {
        corruptDownload = true
      },
      fail: (point: string) => {
        failure = point
      },
      recover: () => {
        corruptDownload = false
        failure = ''
      },
      state: () => release,
    }
  }

  it('reuses the same draft ID without creating another release', () => {
    const { cwd, calls, options } = workflowFixture()
    workflowRelease('prepare', options)
    workflowRelease('prepare', options)
    expect(readFileSync(join(cwd, 'outputs'), 'utf8')).toBe(
      'published=false\nrelease-id=123\npublished=false\nrelease-id=123\n',
    )
    expect(calls.some((call) => call.includes('create'))).toBe(false)
  })

  it('leaves published releases untouched on prepare and final-step retries', () => {
    const { calls, options } = workflowFixture(false, false)
    workflowRelease('prepare', options)
    workflowRelease('publish', options)
    expect(
      calls.some((call) => ['create', 'download', 'edit'].some((action) => call.includes(action))),
    ).toBe(false)
  })

  it('requires notes before starting a draft build', () => {
    const { calls, options } = workflowFixture(true, false)
    expect(() => workflowRelease('prepare', options)).toThrow()
    expect(calls.some((call) => call.includes('create') || call.includes('edit'))).toBe(false)
  })

  it('verifies both downloaded installers before notes and publication; a second publish is a no-op', () => {
    const { calls, options } = workflowFixture()
    workflowRelease('publish', options)
    workflowRelease('publish', options)
    const downloads = calls
      .map((call, i) => (call.includes('download') ? i : -1))
      .filter((i) => i >= 0)
    const edit = calls.findIndex((call) => call.includes('--notes-file'))
    const publish = calls.findIndex((call) => call.includes('--draft=false'))
    expect(downloads).toHaveLength(2)
    expect(Math.max(...downloads)).toBeLessThan(edit)
    expect(edit).toBeLessThan(publish)
    expect(calls.filter((call) => call.includes('--draft=false'))).toHaveLength(1)
  })

  it('blocks notes and publication when downloaded bytes differ from the current build', () => {
    const { calls, options, corrupt } = workflowFixture()
    corrupt()
    expect(() => workflowRelease('publish', options)).toThrow('differs from this build')
    expect(calls.some((call) => call.includes('edit'))).toBe(false)
  })

  it('creates once, fails after upload, and reuses the same draft on rerun before publishing once', () => {
    const { cwd, calls, options, corrupt, recover, state } = workflowFixture(null)
    workflowRelease('prepare', options)
    expect(state()?.draft).toBe(true)
    // The fake API exposes both uploaded installer names; fail their downloaded bytes.
    corrupt()
    expect(() => workflowRelease('publish', options)).toThrow('differs from this build')
    expect(state()?.draft).toBe(true)
    recover()
    workflowRelease('prepare', options)
    expect(readFileSync(join(cwd, 'outputs'), 'utf8')).toBe(
      'published=false\nrelease-id=123\npublished=false\nrelease-id=123\n',
    )
    workflowRelease('publish', options)
    workflowRelease('prepare', options)
    expect(calls.filter((call) => call.includes('create'))).toHaveLength(1)
    expect(calls.filter((call) => call.includes('--draft=false'))).toHaveLength(1)
    expect(state()?.draft).toBe(false)
  })

  it.each(['notes', 'api'])('keeps the draft unpublished on %s failure', (point) => {
    const { calls, options, fail, state } = workflowFixture()
    fail(point)
    expect(() => workflowRelease('publish', options)).toThrow()
    expect(state()?.draft).toBe(true)
    expect(calls.some((call) => call.includes('--draft=false'))).toBe(false)
  })

  it('requires notes again immediately before publication, even after uploading assets', () => {
    const { cwd, calls, options, state } = workflowFixture()
    rmSync(join(cwd, 'docs/releases/v1.7.5.md'))
    expect(() => workflowRelease('publish', options)).toThrow()
    expect(state()?.draft).toBe(true)
    expect(calls.some((call) => call.includes('edit'))).toBe(false)
  })
})
