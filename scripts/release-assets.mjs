/** Workflow-only draft lifecycle. gh is preinstalled on GitHub's Windows runner. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkVersions } from './release.mjs'

function ensure(condition, message) {
  if (!condition) throw new Error(message)
}

export function validateAssets(assets, expected, version) {
  ensure(
    expected.length === 2 &&
      expected.some((a) => a.name.endsWith('.exe')) &&
      expected.some((a) => a.name.endsWith('.msi')),
    'Expected exactly one NSIS installer and one MSI installer.',
  )
  ensure(new Set(expected.map((a) => a.name)).size === 2, 'Duplicate installer names.')
  ensure(assets.length === expected.length, 'Unexpected or missing release assets.')
  for (const file of expected) {
    ensure(
      file.name.includes(`_${version}_x64`) && /\.(exe|msi)$/.test(file.name),
      `Wrong installer version or architecture: ${file.name}`,
    )
    const asset = assets.find((a) => a.name === file.name)
    ensure(
      asset?.state === 'uploaded' && asset.size > 0 && asset.size === file.size,
      `Incomplete or mismatched installer: ${file.name}`,
    )
    if (asset.digest)
      ensure(asset.digest === `sha256:${file.sha256}`, `Installer digest mismatch: ${file.name}`)
  }
}

export function releaseState(releases, tag) {
  const matches = releases.filter((release) => release.tag_name === tag)
  ensure(matches.length <= 1, `Multiple releases found for ${tag}.`)
  return matches[0]
}

export function workflowRelease(
  mode,
  {
    cwd = process.cwd(),
    env = process.env,
    exec = (command, args) =>
      execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim(),
    log = console.log,
  } = {},
) {
  const tag = env.GITHUB_REF_NAME
  const repo = env.GITHUB_REPOSITORY
  ensure(repo?.toLowerCase() === 'sharaujo/mosaic-orchestrator', 'Unexpected release repository.')
  const version = checkVersions(cwd, tag)
  const gh = (...args) => exec('gh', args)
  const api = (path) => JSON.parse(gh('api', `repos/${repo}/${path}`))
  const git = (...args) => exec('git', args)
  const assertTag = () => {
    ensure(git('cat-file', '-t', `refs/tags/${tag}`) === 'tag', 'Release tag must be annotated.')
    ensure(
      git('rev-parse', `refs/tags/${tag}^{commit}`) === git('rev-parse', 'HEAD'),
      'Tag no longer matches the checked-out commit.',
    )
    ensure(
      api(`git/ref/tags/${tag}`).object.sha === git('rev-parse', `refs/tags/${tag}`),
      'Remote tag changed during the release.',
    )
  }
  const output = (name, value) => appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`)
  const notesPath = resolve(cwd, `docs/releases/${tag}.md`)
  const notes = () => {
    const body = readFileSync(notesPath, 'utf8')
    ensure(body.trim(), `Release notes are empty: ${notesPath}`)
    return body
  }
  if (mode === 'prepare') {
    assertTag()
    git('merge-base', '--is-ancestor', 'HEAD', 'origin/main')
    const pages = JSON.parse(
      gh('api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`),
    )
    let release = releaseState(pages.flat(), tag)
    if (release && !release.draft) {
      log(`${tag} is already published; rerun leaves it unchanged.`)
      output('published', 'true')
      return
    }
    notes()
    if (!release) {
      gh(
        'release',
        'create',
        tag,
        '--repo',
        repo,
        '--draft',
        '--verify-tag',
        '--target',
        git('rev-parse', 'HEAD'),
        '--title',
        `mosAIco ${tag}`,
        '--notes-file',
        notesPath,
      )
      // Drafts must be found by listing releases rather than by the tag endpoint.
      release = releaseState(
        JSON.parse(
          gh('api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`),
        ).flat(),
        tag,
      )
    }
    ensure(release?.draft, 'Expected a draft release.')
    output('published', 'false')
    output('release-id', release.id)
    return
  }
  ensure(mode === 'publish', 'Use prepare or publish.')
  const id = env.RELEASE_ID
  ensure(/^\d+$/.test(id ?? ''), 'Missing release ID.')
  const initial = api(`releases/${id}`)
  ensure(initial.tag_name === tag, 'Release ID belongs to a different tag.')
  if (!initial.draft) {
    log(`${tag} is already published; leaving it unchanged.`)
    return
  }
  const getDraft = () => {
    const release = api(`releases/${id}`)
    ensure(
      release.tag_name === tag && release.draft && !release.prerelease,
      'Release must still be the expected stable draft.',
    )
    return release
  }
  getDraft()
  const expected = JSON.parse(env.ARTIFACT_PATHS).map((file) => {
    const data = readFileSync(file)
    return {
      name: basename(file),
      size: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    }
  })
  const assets = JSON.parse(
    gh('api', '--paginate', '--slurp', `repos/${repo}/releases/${id}/assets?per_page=100`),
  ).flat()
  validateAssets(assets, expected, version)
  const download = mkdtempSync(join(tmpdir(), 'mosaico-release-verify-'))
  try {
    for (const file of expected) {
      gh('release', 'download', tag, '--repo', repo, '--pattern', file.name, '--dir', download)
      const digest = createHash('sha256')
        .update(readFileSync(join(download, file.name)))
        .digest('hex')
      ensure(digest === file.sha256, `Downloaded installer differs from this build: ${file.name}`)
    }
  } finally {
    rmSync(download, { recursive: true, force: true })
  }
  const body = notes()
  gh('release', 'edit', tag, '--repo', repo, '--notes-file', notesPath)
  ensure(getDraft().body === body, 'Release notes were not applied exactly.')
  assertTag()
  // This is the only publication operation; all preceding failures leave a draft.
  gh('release', 'edit', tag, '--repo', repo, '--draft=false', '--verify-tag')
  log(`Published ${tag} after installer and release-note verification.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    workflowRelease(process.argv[2])
  } catch (error) {
    console.error(`Release failed: ${error.message}`)
    process.exitCode = 1
  }
}
