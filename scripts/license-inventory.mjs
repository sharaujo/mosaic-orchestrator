// Windows dependency evidence plus reproducible legal-resource materialization.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectDistribution,
  licenseInputDigest,
  validateDistribution,
} from './license-distribution.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'THIRD_PARTY_LICENSES/inventory.json')
const target = 'x86_64-pc-windows-msvc'
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const read = (path) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
const hash = (body) => createHash('sha256').update(body).digest('hex')
const json = (path) => JSON.parse(read(path))
const legalName = /^(?:licen[sc]e|notice|copying|copyright|unlicense)(?:$|[-_.])/i
const sourceOrMap = /\.(?:[cm]?[jt]sx?|map)$/i

if (process.argv.includes('--source-only')) {
  validateDistribution(root)
  console.log('Versioned Windows inventory and legal resources are current (offline).')
  process.exit(0)
}

function legalFiles(directory) {
  const files = []
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const path = join(current, entry.name)
      if (entry.isDirectory() && !['node_modules', '.git', 'target'].includes(entry.name)) {
        visit(path)
      } else if (
        entry.isFile() &&
        legalName.test(entry.name) &&
        // Keep JSZip's standalone comment notice, but not icons/build scripts/maps.
        (!sourceOrMap.test(entry.name) || /^license_header\.js$/i.test(entry.name))
      ) {
        const text = read(path)
        files.push({
          path: relative(directory, path).replaceAll('\\', '/'),
          sha256: hash(text),
          copyright: [...new Set(text.split('\n').filter((line) => /copyright|©/i.test(line)))],
        })
      }
    }
  }
  visit(directory)
  return files.sort((a, b) => compare(a.path, b.path))
}

const lock = json(join(root, 'package-lock.json'))
const npm = Object.entries(lock.packages)
  .filter(([path]) => path)
  .map(([path, item]) => {
    const installed = join(root, path, 'package.json')
    const manifest = existsSync(installed) ? json(installed) : null
    const versionMismatch = !!manifest && manifest.version !== item.version
    const category = item.dev || path.includes('/@types/') ? 'A' : 'B'
    const files = manifest ? legalFiles(join(root, path)) : []
    // khroma omits license metadata, but ships this exact MIT text. Do not infer
    // licenses for other metadata omissions from filenames or package names.
    const khroma = manifest?.name === 'khroma' && item.version === '2.1.0'
    const khromaFile = files.find((file) => file.path.toLowerCase() === 'license')
    const verifiedKhroma =
      khroma &&
      khromaFile?.sha256 === '66b333b0f66759a0b710459e03f7029abe17f4358114a128d2c972e642961b49'
    const license =
      manifest?.license ?? item.license ?? (verifiedKhroma ? 'MIT (LICENSE text)' : null)
    return {
      ecosystem: 'npm',
      name: manifest?.name ?? path.split('node_modules/').at(-1),
      version: manifest?.version ?? item.version,
      versionSource: manifest ? 'installed-manifest' : 'lockfile-only',
      installedVersion: manifest?.version ?? null,
      lockVersion: item.version,
      versionMismatch,
      path,
      category,
      scope:
        category === 'A'
          ? 'build/test/types; not assumed redistributed'
          : 'production graph candidate; not a bundle inclusion claim',
      installed: !!manifest,
      license,
      licenseSource: manifest?.license
        ? 'installed-manifest'
        : verifiedKhroma
          ? 'installed-license-file'
          : item.license
            ? 'lockfile-only'
            : null,
      origin: item.resolved ?? null,
      repository: manifest?.repository?.url ?? manifest?.repository ?? null,
      legalFiles: files,
      status: versionMismatch
        ? 'BLOCKER'
        : category === 'A'
          ? 'CLEAR'
          : !license
            ? 'UNKNOWN'
            : 'CLEAR WITH NOTICE',
    }
  })
  .sort((a, b) => compare(a.path, b.path))

// Cargo resolves versions/features/target conditions. A lockfile alone cannot
// distinguish runtime, host build dependencies, proc macros, or other platforms.
const cargo = JSON.parse(
  execFileSync(
    'cargo',
    [
      'metadata',
      '--locked',
      '--offline',
      '--format-version',
      '1',
      '--filter-platform',
      target,
      '--manifest-path',
      'src-tauri/Cargo.toml',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ),
)
const packages = new Map(cargo.packages.map((item) => [item.id, item]))
const nodes = new Map(cargo.resolve.nodes.map((item) => [item.id, item]))
const runtime = new Set()
function visitRuntime(id) {
  if (runtime.has(id)) return
  runtime.add(id)
  for (const dependency of nodes.get(id).deps) {
    const pkg = packages.get(dependency.pkg)
    if (
      dependency.dep_kinds.some((kind) => kind.kind === null) &&
      !pkg.targets.some((item) => item.kind.includes('proc-macro'))
    )
      visitRuntime(dependency.pkg)
  }
}
visitRuntime(cargo.resolve.root)
const rust = cargo.packages
  .filter((item) => item.id !== cargo.resolve.root)
  .map((item) => ({
    ecosystem: 'cargo',
    name: item.name,
    version: item.version,
    category: runtime.has(item.id) ? 'B' : 'A',
    scope: runtime.has(item.id)
      ? 'Windows normal dependency graph; final linker retention unverified'
      : 'host build/proc macro/tooling; generated output requires separate review',
    license: item.license,
    licenseFile: item.license_file
      ? relative(dirname(item.manifest_path), item.license_file).replaceAll('\\', '/')
      : null,
    origin: item.source,
    repository: item.repository,
    links: item.links,
    features: nodes.get(item.id)?.features ?? [],
    legalFiles: legalFiles(dirname(item.manifest_path)),
    status: !runtime.has(item.id)
      ? 'CLEAR'
      : !item.license && !item.license_file
        ? 'UNKNOWN'
        : 'CLEAR WITH NOTICE',
  }))
  .sort((a, b) => compare(`${a.name}@${a.version}`, `${b.name}@${b.version}`))

const data = {
  schema: 3,
  purpose:
    'Windows dependency evidence; distribution coverage and native decisions are recorded separately',
  target,
  categories: {
    A: 'Build/test/dev/type-only; no claim that generated output has no obligations',
    B: 'Runtime dependency candidate; conservative graph, not final bundle measurement',
    C: 'Vendored source; see THIRD-PARTY-NOTICES.md',
    D: 'Native/prebuilt; see THIRD-PARTY-NOTICES.md; not covered by crate metadata alone',
    E: 'Font/asset; see THIRD-PARTY-NOTICES.md',
  },
  inputs: Object.fromEntries(
    [
      'package-lock.json',
      'src-tauri/Cargo.lock',
      'src-tauri/Cargo.toml',
      'THIRD_PARTY_LICENSES/components.json',
      'THIRD_PARTY_LICENSES/overrides.json',
    ].map((path) => [path, licenseInputDigest(root, path)]),
  ),
  npm,
  rust,
  native: json(join(root, 'THIRD_PARTY_LICENSES/components.json')),
}
const rendered = `${JSON.stringify(data, null, 2)}\n`
if (process.argv.includes('--check')) {
  if (!existsSync(output) || JSON.stringify(json(output)) !== JSON.stringify(data)) {
    throw Error('License inventory missing or stale; run node scripts/license-inventory.mjs')
  }
  console.log('Windows inventory is current; checking preserved legal resources.')
  validateDistribution(root)
} else {
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, rendered)
  const sources = {
    purpose:
      'Locked public dependency-source coordinates for the supplied application source; package archives are the exact published build inputs, with upstream source repositories identified separately.',
    npm: npm
      .filter((item) => item.installed && item.category === 'B')
      .map((item) => ({
        name: item.name,
        version: item.version,
        archive: item.origin,
        integrity: lock.packages[item.path].integrity,
        upstreamSource: item.repository,
      })),
    cargo: rust.map((item) => ({
      name: item.name,
      version: item.version,
      archive: `https://crates.io/api/v1/crates/${item.name}/${item.version}/download`,
      upstreamSource: item.repository,
    })),
    native: data.native.upstreamSources,
  }
  writeFileSync(
    join(root, 'THIRD_PARTY_LICENSES/dependency-sources.json'),
    `${JSON.stringify(sources, null, 2)}\n`,
  )
  collectDistribution(
    root,
    data,
    new Map(
      cargo.packages.map((item) => [`${item.name}@${item.version}`, dirname(item.manifest_path)]),
    ),
  )
  console.log(`Wrote ${npm.length} npm and ${rust.length} Cargo evidence records.`)
}
if (
  process.argv.includes('--check') &&
  [...npm, ...rust].some((item) => ['UNKNOWN', 'BLOCKER'].includes(item.status))
) {
  throw Error('Inventory contains UNKNOWN/BLOCKER records; distribution review is required')
}
