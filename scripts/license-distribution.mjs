import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crc32, deflateRawSync } from 'node:zlib'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const binaryFile = /\.(?:zip|crate|gz|bz2|xz|docx)$/i
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
export const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const text = (path) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
const ensure = (condition, message) => {
  if (!condition) throw Error(message)
}
const slash = (path) => path.replaceAll('\\', '/')
const packageKey = (item) =>
  `${item.name.replaceAll(/[^a-zA-Z0-9._-]/g, '_')}-${item.version.replaceAll(/[^a-zA-Z0-9._-]/g, '_')}`

function inside(root, path) {
  const result = resolve(root, path)
  const rel = relative(root, result)
  ensure(
    rel && !rel.startsWith('..') && !resolve(path).startsWith('\\\\'),
    `Unsafe license path: ${path}`,
  )
  return result
}

export function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name)
      ensure(!entry.isSymbolicLink(), `Symlink is not allowed in legal resources: ${path}`)
      return entry.isDirectory() ? walkFiles(path) : [path]
    })
    .sort((a, b) => compare(slash(relative(directory, a)), slash(relative(directory, b))))
}

function content(path) {
  return binaryFile.test(path) ? readFileSync(path) : Buffer.from(text(path))
}

/** Own-version bumps do not change dependency/legal inputs or require a license-only commit. */
export function licenseInputDigest(root, path) {
  let body = text(inside(root, path))
  if (path === 'package-lock.json') {
    const lock = JSON.parse(body)
    delete lock.version
    if (lock.packages?.['']) delete lock.packages[''].version
    body = JSON.stringify(lock)
  } else if (path === 'src-tauri/Cargo.toml') {
    body = body.replace(/\[package\][\s\S]*?(?=\n\[|$)/, (block) =>
      block.replace(/^version(\s*=\s*)"[^"]+"/m, 'version$1"<application>"'),
    )
  } else if (path === 'src-tauri/Cargo.lock') {
    body = body
      .split('[[package]]')
      .map((block) =>
        /^\s*name = "mosaico"/m.test(block)
          ? block.replace(/^version(\s*=\s*)"[^"]+"/m, 'version$1"<application>"')
          : block,
      )
      .join('[[package]]')
  }
  return sha256(body)
}

function validateSourceObligations(root, inventory, components) {
  const directory = join(root, 'THIRD_PARTY_LICENSES')
  const selections = components.licenseSelections ?? {}
  const checksums = new Map(
    text(join(root, 'src-tauri/Cargo.lock'))
      .split('[[package]]')
      .slice(1)
      .map((block) => {
        const name = block.match(/\bname = "([^"]+)"/)?.[1]
        const version = block.match(/\bversion = "([^"]+)"/)?.[1]
        return [`${name}@${version}`, block.match(/\bchecksum = "([^"]+)"/)?.[1]]
      }),
  )
  for (const item of [...inventory.npm, ...inventory.rust]) {
    ensure(
      !['UNKNOWN', 'BLOCKER'].includes(item.status),
      `Unresolved dependency decision: ${item.name}@${item.version}`,
    )
    const selected = selections[`${item.ecosystem}:${item.name}@${item.version}`]
    if (selected)
      ensure(
        item.license?.includes(selected) &&
          /^(?:MIT|Apache-2.0|BSD-2-Clause|BSD-3-Clause|ISC)$/.test(selected),
        `Invalid license selection: ${item.name}`,
      )
    const effective = selected ?? item.license ?? ''
    if (item.category === 'B')
      ensure(
        !/GPL|LGPL|AGPL|CPL|MS-RL|EPL/.test(effective),
        `New reciprocal license needs a reviewed source arrangement: ${item.name}`,
      )
    if (item.ecosystem === 'cargo' && /MPL/.test(effective)) {
      const path = join(directory, 'sources', `${item.name}-${item.version}.crate`)
      ensure(existsSync(path), `Missing exact MPL source: ${item.name}@${item.version}`)
      ensure(
        sha256(readFileSync(path)) === checksums.get(`${item.name}@${item.version}`),
        `MPL source does not match Cargo.lock: ${item.name}`,
      )
    } else if (item.ecosystem === 'npm' && item.category === 'B')
      ensure(
        !/MPL/.test(effective),
        `New MPL package needs a reviewed source arrangement: ${item.name}`,
      )
  }
  for (const source of json(join(directory, 'provenance.json'))) {
    if (binaryFile.test(source.path))
      ensure(
        sha256(readFileSync(inside(directory, source.path))) === source.sha256,
        `Upstream source/document digest mismatch: ${source.path}`,
      )
  }
}

/** Copy upstream legal files without depending on minified bundle comments. */
export function collectDistribution(root, inventory, rustRoots) {
  const directory = join(root, 'THIRD_PARTY_LICENSES')
  validateSourceObligations(root, inventory, json(join(directory, 'components.json')))
  const overrides = json(join(directory, 'overrides.json'))
  for (const name of ['npm', 'cargo']) {
    const generated = inside(root, `THIRD_PARTY_LICENSES/${name}`)
    ensure(
      !existsSync(generated) || !lstatSync(generated).isSymbolicLink(),
      'Unsafe generated directory',
    )
    rmSync(generated, { recursive: true, force: true })
  }
  const packages = []
  const seen = new Set()
  for (const item of [...inventory.npm, ...inventory.rust]) {
    if (item.ecosystem === 'npm' && !item.installed) continue
    const id = `${item.ecosystem}:${item.name}@${item.version}`
    if (seen.has(id)) continue
    seen.add(id)
    const origin =
      item.ecosystem === 'npm'
        ? join(root, item.path)
        : rustRoots.get(`${item.name}@${item.version}`)
    const files = []
    for (const legal of item.legalFiles) {
      const source = inside(origin, legal.path)
      const destination = `${item.ecosystem}/${packageKey(item)}/${legal.path}`
      const output = inside(directory, destination)
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, text(source))
      files.push(destination)
    }
    const override = overrides.find(
      (value) =>
        value.ecosystem === item.ecosystem &&
        value.name === item.name &&
        value.version === item.version,
    )
    if (!files.length && override) files.push(...override.files.map((file) => file.path))
    ensure(item.category !== 'B' || files.length, `Missing runtime legal text: ${id}`)
    packages.push({
      ecosystem: item.ecosystem,
      name: item.name,
      version: item.version,
      license: item.license,
      runtimeCandidate: item.category === 'B',
      files: files.sort(compare),
    })
  }
  const files = walkFiles(directory)
    .filter((path) => slash(relative(directory, path)) !== 'distribution.json')
    .map((path) => ({ path: slash(relative(directory, path)), sha256: sha256(content(path)) }))
  const manifest = {
    schema: 1,
    target: inventory.target,
    noticeSHA256: sha256(text(join(root, 'THIRD-PARTY-NOTICES.md'))),
    packages,
    files,
  }
  writeFileSync(join(directory, 'distribution.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

/** Offline, platform-independent validation of the versioned distribution inputs. */
export function validateDistribution(root = projectRoot) {
  const directory = join(root, 'THIRD_PARTY_LICENSES')
  const inventory = json(join(directory, 'inventory.json'))
  const manifest = json(join(directory, 'distribution.json'))
  const components = json(join(directory, 'components.json'))
  ensure(
    inventory.schema === 3 &&
      inventory.target === 'x86_64-pc-windows-msvc' &&
      manifest.schema === 1,
    'Unexpected license profile',
  )
  ensure(
    components.nativeGeneration === 'sherpa-onnx-2.0.1-win-x64-static-MT-Release-lib' &&
      components.onnxruntime === '1.28.2',
    'Unexpected native license generation',
  )
  for (const id of [
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
  ])
    ensure(
      components.components.some((item) => item.id === id),
      `Missing component decision: ${id}`,
    )
  for (const [path, digest] of Object.entries(inventory.inputs))
    ensure(licenseInputDigest(root, path) === digest, `Stale license input: ${path}`)
  validateSourceObligations(root, inventory, components)
  ensure(
    sha256(text(join(root, 'THIRD-PARTY-NOTICES.md'))) === manifest.noticeSHA256,
    'Consolidated notices changed; regenerate the distribution',
  )
  const actual = walkFiles(directory)
    .map((path) => slash(relative(directory, path)))
    .filter((path) => path !== 'distribution.json')
  ensure(
    JSON.stringify(actual) === JSON.stringify(manifest.files.map((file) => file.path)),
    'Unexpected or missing legal resource files',
  )
  for (const file of manifest.files)
    ensure(
      sha256(content(inside(directory, file.path))) === file.sha256,
      `Legal resource changed: ${file.path}`,
    )
  for (const item of components.components) {
    ensure(!['UNKNOWN', 'BLOCKER'].includes(item.status), `Unresolved component: ${item.name}`)
    if (item.redistributed)
      ensure(
        !/espeak|piper[-_]phonemize|^(?:piper|ucd|ucd-tools)$/i.test(item.id),
        `Removed native dependency returned: ${item.id}`,
      )
    if (item.status === 'NEEDS SOURCE NOTICE' && item.id !== 'mosaico')
      ensure(item.sourceFiles?.length, `Missing source arrangement: ${item.name}`)
    for (const path of [...item.legalFiles, ...(item.sourceFiles ?? [])])
      ensure(existsSync(inside(directory, path)), `Missing required legal/source file: ${path}`)
  }
  for (const item of [...inventory.npm, ...inventory.rust].filter(
    (item) => item.category === 'B' && (item.ecosystem !== 'npm' || item.installed),
  )) {
    const record = manifest.packages.find(
      (value) =>
        value.ecosystem === item.ecosystem &&
        value.name === item.name &&
        value.version === item.version,
    )
    ensure(record?.files.length, `Runtime license coverage missing: ${item.name}@${item.version}`)
  }
  const lock = text(join(root, 'src-tauri/Cargo.lock'))
  for (const name of ['sherpa-onnx', 'sherpa-onnx-sys'])
    ensure(lock.includes(`name = "${name}"\nversion = "2.0.1"`), `Unexpected ${name} version`)
  const config = {
    ...json(join(root, 'src-tauri/tauri.conf.json')).bundle,
    ...json(join(root, 'src-tauri/tauri.release.json')).bundle,
  }
  ensure(
    config.resources?.['../THIRD-PARTY-NOTICES.md'] === 'THIRD-PARTY-NOTICES.md',
    'Notices are not mapped into the bundle root',
  )
  ensure(
    config.resources?.['../THIRD_PARTY_LICENSES/'] === 'THIRD_PARTY_LICENSES/',
    'Legal directory is not mapped into the bundle',
  )
  ensure(
    config.resources?.['target/license-source/mosaico-source.zip'] ===
      'THIRD_PARTY_LICENSES/sources/mosaico-source.zip',
    'Corresponding-source archive is not mapped into the bundle',
  )
  ensure(
    config.licenseFile === '../THIRD_PARTY_LICENSES/WINDOWS-TERMS.rtf',
    'Installer agreement is not configured',
  )
  return { inventory, manifest, components }
}

function sourceFiles(root) {
  let paths
  if (existsSync(join(root, '.git'))) {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
      .filter((path) =>
        /^(?:THIRD-PARTY-NOTICES\.md|THIRD_PARTY_LICENSES\/|scripts\/(?:license|inspect-msi)|src\/lib\/license)/.test(
          path,
        ),
      )
    paths = [...tracked, ...untracked]
  } else {
    paths = json(join(root, 'SOURCE-MANIFEST.json')).files.map((file) => file.path)
  }
  paths.push(
    ...walkFiles(join(root, 'THIRD_PARTY_LICENSES')).map((path) => slash(relative(root, path))),
  )
  return [...new Set(paths)]
    .sort(compare)
    .filter((path) => !path.startsWith('src-tauri/target/'))
    .map((path) => {
      const absolute = inside(root, path)
      ensure(lstatSync(absolute).isFile(), `Source archive requires a regular file: ${path}`)
      // Tauri rewrites Cargo.toml with LF on Windows; this is the same source.
      const data =
        path === 'src-tauri/Cargo.toml' ? Buffer.from(text(absolute)) : readFileSync(absolute)
      return { path, data }
    })
}

/** Deterministic ZIP with fixed timestamps; no network or external archiver is needed. */
export function zipFiles(files) {
  ensure(files.length < 65535, 'Too many source files for ZIP')
  const entries = [],
    central = []
  let offset = 0
  for (const file of files) {
    ensure(!file.path.startsWith('/') && !file.path.split('/').includes('..'), 'Unsafe ZIP member')
    const name = Buffer.from(file.path),
      body = deflateRawSync(file.data),
      crc = crc32(file.data)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x800, 6)
    header.writeUInt16LE(8, 8)
    header.writeUInt16LE(0x21, 12)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(body.length, 18)
    header.writeUInt32LE(file.data.length, 22)
    header.writeUInt16LE(name.length, 26)
    entries.push(header, name, body)
    const index = Buffer.alloc(46)
    index.writeUInt32LE(0x02014b50, 0)
    index.writeUInt16LE(20, 4)
    index.writeUInt16LE(20, 6)
    index.writeUInt16LE(0x800, 8)
    index.writeUInt16LE(8, 10)
    index.writeUInt16LE(0x21, 14)
    index.writeUInt32LE(crc, 16)
    index.writeUInt32LE(body.length, 20)
    index.writeUInt32LE(file.data.length, 24)
    index.writeUInt16LE(name.length, 28)
    index.writeUInt32LE(offset, 42)
    central.push(index, name)
    offset += header.length + name.length + body.length
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...entries, directory, end])
}

export function prepareSource(root = projectRoot) {
  validateDistribution(root)
  const files = sourceFiles(root)
  const snapshot = {
    schema: 1,
    version: json(join(root, 'package.json')).version,
    files: files.map((file) => ({ path: file.path, sha256: sha256(file.data) })),
  }
  const manifest = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`)
  const archive = zipFiles([...files, { path: 'SOURCE-MANIFEST.json', data: manifest }])
  const directory = join(root, 'src-tauri/target/license-source')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'mosaico-source.zip'), archive)
  writeFileSync(
    join(directory, 'source-manifest.json'),
    `${JSON.stringify({ ...snapshot, archiveSHA256: sha256(archive) }, null, 2)}\n`,
  )
  return { files: files.length, bytes: archive.length, sha256: sha256(archive) }
}

function verifySource(root) {
  const directory = join(root, 'src-tauri/target/license-source')
  const receipt = json(join(directory, 'source-manifest.json'))
  ensure(
    sha256(readFileSync(join(directory, 'mosaico-source.zip'))) === receipt.archiveSHA256,
    'Source archive digest mismatch',
  )
  const current = sourceFiles(root).map((file) => ({ path: file.path, sha256: sha256(file.data) }))
  ensure(
    JSON.stringify(current) === JSON.stringify(receipt.files),
    'Corresponding source is stale; run license-distribution.mjs prepare',
  )
  return receipt
}

function archiver() {
  for (const command of [process.env.SEVEN_ZIP, 'C:/Program Files/7-Zip/7z.exe', '7z'].filter(
    Boolean,
  )) {
    try {
      execFileSync(command, ['i'], { stdio: 'pipe' })
      return command
    } catch {
      /* Try the next installed 7-Zip. */
    }
  }
  throw Error('7-Zip is required to verify Windows installer payloads')
}

/** Validate payload bytes and target paths without installing or executing a package. */
export function validateInstallers(paths, root = projectRoot) {
  const { manifest } = validateDistribution(root)
  const source = verifySource(root)
  ensure(
    paths.length === 2 &&
      paths.some((path) => path.endsWith('.msi')) &&
      paths.some((path) => path.endsWith('.exe')),
    'Expected one NSIS and one MSI installer',
  )
  const sevenZip = archiver(),
    temporary = mkdtempSync(join(tmpdir(), 'mosaico-license-'))
  const results = []
  try {
    for (const path of paths) {
      const kind = path.endsWith('.msi') ? 'msi' : 'nsis'
      const extracted = join(temporary, kind)
      execFileSync(sevenZip, ['x', resolve(path), `-o${extracted}`, '-y'], {
        stdio: 'pipe',
        maxBuffer: 32 * 1024 * 1024,
      })
      let resolvePayload
      if (kind === 'msi') {
        const cabinet = walkFiles(extracted).find((file) => file.endsWith('.cab'))
        ensure(cabinet, 'MSI has no embedded cabinet')
        const payload = join(temporary, 'msi-files')
        execFileSync(sevenZip, ['x', cabinet, `-o${payload}`, '-y'], {
          stdio: 'pipe',
          maxBuffer: 32 * 1024 * 1024,
        })
        const table = JSON.parse(
          execFileSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              join(root, 'scripts/inspect-msi.ps1'),
              '-Path',
              resolve(path),
            ],
            { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
          ),
        )
        ensure(
          table.licenseText.includes('MICROSOFT') && table.licenseText.includes('SmartScreen'),
          'MSI is missing the Microsoft agreement/notice page',
        )
        resolvePayload = (name) => {
          const entry = table.files.find((file) => file.path === name)
          ensure(entry, `Missing MSI install target: ${name}`)
          return join(payload, entry.id)
        }
      } else {
        resolvePayload = (name) => inside(extracted, name)
      }
      ensure(
        sha256(text(resolvePayload('THIRD-PARTY-NOTICES.md'))) === manifest.noticeSHA256,
        `Consolidated notices differ in ${kind}`,
      )
      for (const file of manifest.files) {
        const payload = resolvePayload(`THIRD_PARTY_LICENSES/${file.path}`)
        ensure(
          existsSync(payload) &&
            sha256(
              binaryFile.test(file.path) ? readFileSync(payload) : Buffer.from(text(payload)),
            ) === file.sha256,
          `${kind} missing/changed legal resource: ${file.path}`,
        )
      }
      const distributedManifest = json(resolvePayload('THIRD_PARTY_LICENSES/distribution.json'))
      ensure(
        JSON.stringify(distributedManifest) === JSON.stringify(manifest),
        `${kind} legal manifest differs`,
      )
      const archive = resolvePayload('THIRD_PARTY_LICENSES/sources/mosaico-source.zip')
      ensure(
        sha256(readFileSync(archive)) === source.archiveSHA256,
        `${kind} corresponding source differs`,
      )
      execFileSync(sevenZip, ['t', archive], { stdio: 'pipe', maxBuffer: 4 * 1024 * 1024 })
      results.push({
        kind,
        artifact: resolve(path),
        legalFiles: manifest.files.length + 2,
        sourceSHA256: source.archiveSHA256,
        installedNotices: '<INSTALLDIR>/THIRD-PARTY-NOTICES.md',
        installedLicenses: '<INSTALLDIR>/THIRD_PARTY_LICENSES/',
      })
    }
  } finally {
    ensure(
      resolve(temporary).startsWith(resolve(tmpdir()) + '\\') ||
        resolve(temporary).startsWith(resolve(tmpdir()) + '/'),
      'Unsafe temporary cleanup',
    )
    rmSync(temporary, { recursive: true, force: true })
  }
  return results
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const mode = process.argv[2] ?? 'check'
    if (mode === 'prepare') console.log(JSON.stringify(prepareSource(), null, 2))
    else {
      ensure(mode === 'check', 'Use check or prepare')
      validateDistribution()
      if (process.argv.includes('--artifacts')) {
        execFileSync(
          process.execPath,
          [join(projectRoot, 'scripts/license-inventory.mjs'), '--check'],
          { cwd: projectRoot, stdio: 'inherit' },
        )
        const paths = process.env.ARTIFACT_PATHS
          ? JSON.parse(process.env.ARTIFACT_PATHS)
          : process.argv.slice(process.argv.indexOf('--artifacts') + 1)
        console.log(JSON.stringify(validateInstallers(paths), null, 2))
      } else console.log('Versioned Windows license resources are current (offline source check).')
    }
  } catch (error) {
    console.error(`License distribution validation failed: ${error.message}`)
    process.exitCode = 1
  }
}
