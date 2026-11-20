#!/usr/bin/env node
/** Prepare locally on release/vX.Y.Z; tag separately after the PR and main CI pass. */
import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FILES = [
  'package.json',
  'package-lock.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
  'src/lib/changelogData.ts',
]
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const CARGO_VERSION = /(^\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m
const LOCK_VERSION = /(\[\[package\]\]\r?\nname = "mosaico"\r?\nversion = ")([^"]+)(")/
const RELEASES = /export const CHANGELOG_RELEASES: ChangelogRelease\[\] = \[\r?\n/

function ensure(condition, message) {
  if (!condition) throw new Error(message)
}

export function nextVersion(current, bump) {
  ensure(VERSION.test(current), `Invalid current version: ${current}`)
  const [major, minor, patch] = current.split('.').map(Number)
  const next =
    {
      patch: `${major}.${minor}.${patch + 1}`,
      minor: `${major}.${minor + 1}.0`,
      major: `${major + 1}.0.0`,
    }[bump] ?? bump
  ensure(VERSION.test(next), 'Use patch, minor, major, or X.Y.Z.')
  const parts = next.split('.').map(Number)
  const changed = parts.findIndex((part, i) => part !== [major, minor, patch][i])
  ensure(
    changed >= 0 && parts[changed] > [major, minor, patch][changed],
    'The next version must be greater than the current version.',
  )
  return next
}

export function checkVersions(cwd = ROOT, expectedTag) {
  const read = (file) => readFileSync(resolve(cwd, file), 'utf8')
  const pkg = JSON.parse(read(FILES[0]))
  const lock = JSON.parse(read(FILES[1]))
  const version = pkg.version
  ensure(VERSION.test(version), `Invalid package version: ${version}`)
  const versions = [
    lock.version,
    lock.packages?.['']?.version,
    JSON.parse(read(FILES[2])).version,
    read(FILES[3]).match(CARGO_VERSION)?.[2],
    read(FILES[4]).match(LOCK_VERSION)?.[2],
    read(FILES[5])
      .slice(read(FILES[5]).search(RELEASES))
      .match(/\{ version: '([^']+)'/)?.[1],
  ]
  ensure(
    versions.every((value) => value === version),
    `Version files disagree with package.json (${version}): ${versions.join(', ')}`,
  )
  if (expectedTag !== undefined)
    ensure(expectedTag === `v${version}`, `Tag ${expectedTag} does not match version ${version}.`)
  return version
}

// Compare every field except the two npm-owned root version fields.
export function withoutRootVersions(value) {
  const copy = structuredClone(value)
  delete copy.version
  if (copy.packages?.['']) delete copy.packages[''].version
  return copy
}

export async function runRelease({
  args = process.argv.slice(2),
  cwd = ROOT,
  exec = (command, argv) =>
    execFileSync(command, argv, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim(),
  log = console.log,
  now = () => new Date(),
  github,
} = {}) {
  const dryRun = args.includes('--dry-run')
  ensure(
    args.every((arg) => !arg.startsWith('--') || arg === '--dry-run'),
    'Unknown release option.',
  )
  const positional = args.filter((arg) => arg !== '--dry-run')
  const mode = ['tag', 'check'].includes(positional[0]) ? positional.shift() : 'prepare'
  ensure(positional.length <= 1, 'Too many arguments.')
  if (mode === 'check') {
    const version = checkVersions(cwd, positional[0])
    log(`Version files agree: ${version}`)
    return
  }

  const git = (...argv) => exec('git', argv)
  const assertCleanMain = () => {
    ensure(
      !git('status', '--porcelain', '--untracked-files=all'),
      'Working tree is dirty. Commit or discard changes before releasing.',
    )
    ensure(git('branch', '--show-current') === 'main', 'Release operations must start on main.')
  }
  assertCleanMain()
  for (const argv of [
    ['remote', 'get-url', 'origin'],
    ['remote', 'get-url', '--push', 'origin'],
  ]) {
    ensure(
      /^(https:\/\/github\.com\/sharaujo\/mosaic-orchestrator(?:\.git)?|git@github\.com:sharaujo\/mosaic-orchestrator(?:\.git)?)$/i.test(
        git(...argv),
      ),
      'origin must be the official sharaujo/mosaic-orchestrator repository.',
    )
  }
  const head = git('rev-parse', 'HEAD')
  const assertMain = () => {
    assertCleanMain()
    const remote = git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0]
    ensure(
      head === git('rev-parse', 'HEAD') &&
        head === git('rev-parse', 'origin/main') &&
        head === remote,
      'main must equal origin/main and live remote main. Fetch and fast-forward main first.',
    )
  }
  assertMain()
  const current = checkVersions(cwd)
  const version = mode === 'tag' ? positional[0] : nextVersion(current, positional[0] ?? 'patch')
  ensure(VERSION.test(version ?? ''), 'The tag operation requires an explicit X.Y.Z version.')
  const tag = `v${version}`
  if (mode === 'tag') checkVersions(cwd, tag)
  ensure(
    !git('tag', '--list', tag),
    `Local tag ${tag} already exists. Inspect it before proceeding.`,
  )
  ensure(
    !git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`),
    `Remote tag ${tag} already exists.`,
  )
  const mutate = (description, command, argv) => {
    log(`${dryRun ? 'would ' : ''}${description}`)
    if (!dryRun) exec(command, argv)
  }

  if (mode === 'tag') {
    // A token makes gh optional. Neither credentials nor API responses are logged.
    const api =
      github ??
      (async (path) => {
        const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
        if (!token) return JSON.parse(exec('gh', ['api', path]))
        const response = await fetch(`https://api.github.com/${path}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        })
        ensure(response.ok, `Cannot verify main CI: GitHub HTTP ${response.status}.`)
        return response.json()
      })
    const result = await api(
      `repos/sharaujo/mosaic-orchestrator/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${head}&per_page=1`,
    )
    ensure(
      Array.isArray(result?.workflow_runs) && result.workflow_runs.length === 1,
      'Cannot safely identify the latest CI run for this main commit.',
    )
    const run = result.workflow_runs[0]
    ensure(
      run?.head_sha === head &&
        run.head_branch === 'main' &&
        run.event === 'push' &&
        run.status === 'completed' &&
        run.conclusion === 'success',
      'The latest main CI run for this exact commit must have completed successfully.',
    )
    ensure(
      Number.isSafeInteger(run.id) &&
        run.id > 0 &&
        Number.isSafeInteger(run.run_attempt) &&
        run.run_attempt > 0,
      'Cannot safely identify the successful CI run attempt.',
    )
    const resultJobs = await api(
      `repos/sharaujo/mosaic-orchestrator/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
    )
    ensure(
      Array.isArray(resultJobs?.jobs) && resultJobs.total_count === resultJobs.jobs.length,
      'Cannot safely verify the complete CI job list.',
    )
    for (const name of [
      'Frontend (typecheck + build)',
      'Rust check (Windows)',
      'Rust check (Linux)',
    ]) {
      const matches = resultJobs.jobs.filter((job) => job?.name === name)
      const job = matches[0]
      ensure(
        matches.length === 1 &&
          job.run_id === run.id &&
          job.head_sha === head &&
          job.status === 'completed' &&
          job.conclusion === 'success',
        `Required CI job must succeed on this exact main commit: ${name}`,
      )
    }
    assertMain()
    checkVersions(cwd, tag)
    mutate(`tag ${tag} on main commit ${head}`, 'git', ['tag', '-a', tag, '-m', tag, head])
    mutate(`push only ${tag}`, 'git', [
      '-c',
      'push.followTags=false',
      'push',
      'origin',
      `refs/tags/${tag}:refs/tags/${tag}`,
    ])
    log(
      dryRun
        ? 'Dry-run complete; no tag created or pushed.'
        : `Tag ${tag} pushed; the Release workflow will start.`,
    )
    return
  }

  const branch = `release/${tag}`
  ensure(
    !git('for-each-ref', '--format=%(refname)', `refs/heads/${branch}`),
    `Local branch ${branch} already exists.`,
  )
  ensure(
    !git('ls-remote', '--heads', 'origin', `refs/heads/${branch}`),
    `Remote branch ${branch} already exists.`,
  )
  const originals = new Map(FILES.map((file) => [file, readFileSync(resolve(cwd, file), 'utf8')]))
  const data = originals.get(FILES[5])
  const list = data.match(RELEASES)
  ensure(
    list && !data.includes(`{ version: '${version}'`),
    `Cannot insert release ${version} in ${FILES[5]}.`,
  )
  const newline = list[0].endsWith('\r\n') ? '\r\n' : '\n'
  const offset = list.index + list[0].length
  const entry = `  { version: '${version}', date: '${now()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')}', noteKeys: [] },${newline}`
  const updates = new Map([
    [
      FILES[2],
      originals
        .get(FILES[2])
        .replace(
          /("version"\s*:\s*")[^"]+(")/,
          (_, prefix, suffix) => `${prefix}${version}${suffix}`,
        ),
    ],
    [
      FILES[3],
      originals
        .get(FILES[3])
        .replace(CARGO_VERSION, (_, prefix, old, suffix) => `${prefix}${version}${suffix}`),
    ],
    [
      FILES[4],
      originals
        .get(FILES[4])
        .replace(LOCK_VERSION, (_, prefix, old, suffix) => `${prefix}${version}${suffix}`),
    ],
    [FILES[5], data.slice(0, offset) + entry + data.slice(offset)],
  ])
  log(`${current} -> ${version}`)
  mutate(`create branch ${branch}`, 'git', ['switch', '-c', branch])
  const npmArgs = ['version', version, '--no-git-tag-version', '--ignore-scripts', '--offline']
  log(
    `${dryRun ? 'would update' : 'update'} package.json and package-lock.json via npm ${npmArgs.join(' ')}`,
  )
  for (const file of updates.keys()) log(`${dryRun ? 'would update' : 'update'} ${file}`)
  if (!dryRun) {
    try {
      ensure(
        process.env.npm_execpath,
        'Run preparation through npm run release so the active npm CLI is available.',
      )
      exec(process.execPath, [process.env.npm_execpath, ...npmArgs])
      for (const file of FILES.slice(0, 2)) {
        const before = withoutRootVersions(JSON.parse(originals.get(file)))
        const after = withoutRootVersions(JSON.parse(readFileSync(resolve(cwd, file), 'utf8')))
        ensure(
          isDeepStrictEqual(before, after),
          `npm changed non-version metadata in ${file}; refusing the release commit.`,
        )
      }
      for (const [file, content] of updates) writeFileSync(resolve(cwd, file), content)
      checkVersions(cwd, tag)
    } catch (error) {
      for (const [file, content] of originals) writeFileSync(resolve(cwd, file), content)
      throw error
    }
  }
  mutate(`stage version files`, 'git', ['add', '--', ...FILES])
  mutate(`commit chore(release): ${tag}`, 'git', ['commit', '-m', `chore(release): ${tag}`])
  log(
    dryRun
      ? 'Dry-run complete; no files, branch, commit, tag, or push changed.'
      : `Prepared ${branch} locally. Review it, push this branch explicitly, and open a normal PR to main. No tag or push was performed.`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runRelease().catch((error) => {
    console.error(`Release refused: ${error.message}`)
    process.exitCode = 1
  })
}
