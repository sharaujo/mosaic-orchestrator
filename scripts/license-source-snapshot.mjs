import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crc32, inflateRawSync } from 'node:zlib'

import { sha256, zipFiles } from './license-distribution.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ensure = (condition, message) => {
  if (!condition) throw Error(message)
}

/** Repackage only reviewed, unchanged source/build files from a pinned upstream ZIP. */
export function rebuildSourceSnapshot(upstream, profile) {
  ensure(sha256(upstream) === profile.upstream.sha256, 'Upstream source digest mismatch')
  const end = upstream.lastIndexOf(Buffer.from('504b0506', 'hex'))
  ensure(end >= 0 && end + 22 <= upstream.length, 'Invalid source ZIP directory')
  const count = upstream.readUInt16LE(end + 10)
  let offset = upstream.readUInt32LE(end + 16)
  const wanted = new Set(profile.files.map((file) => file.path))
  const found = new Map()
  for (let index = 0; index < count; index++) {
    ensure(upstream.readUInt32LE(offset) === 0x02014b50, 'Invalid source ZIP entry')
    const flags = upstream.readUInt16LE(offset + 8)
    const method = upstream.readUInt16LE(offset + 10)
    const checksum = upstream.readUInt32LE(offset + 16)
    const compressed = upstream.readUInt32LE(offset + 20)
    const bytes = upstream.readUInt32LE(offset + 24)
    const nameBytes = upstream.readUInt16LE(offset + 28)
    const extraBytes = upstream.readUInt16LE(offset + 30)
    const commentBytes = upstream.readUInt16LE(offset + 32)
    const local = upstream.readUInt32LE(offset + 42)
    const name = upstream.toString('utf8', offset + 46, offset + 46 + nameBytes)
    offset += 46 + nameBytes + extraBytes + commentBytes
    if (!wanted.has(name)) continue
    ensure(!(flags & 1) && [0, 8].includes(method), 'Unsupported source ZIP encoding')
    ensure(!found.has(name), 'Duplicate source ZIP entry')
    ensure(upstream.readUInt32LE(local) === 0x04034b50, 'Invalid source ZIP payload')
    const start = local + 30 + upstream.readUInt16LE(local + 26) + upstream.readUInt16LE(local + 28)
    const packed = upstream.subarray(start, start + compressed)
    const data = method === 8 ? inflateRawSync(packed) : packed
    ensure(data.length === bytes && crc32(data) === checksum, `Damaged source entry: ${name}`)
    found.set(name, data)
  }
  const files = profile.files.map((file) => {
    ensure(
      !/\.(?:exe|dll|lib|obj|pdb|msi|msm|msp|pfx|p12)$/i.test(file.path),
      `Compiled output/credential fixture is not source: ${file.path}`,
    )
    const data = found.get(file.path)
    ensure(data && sha256(data) === file.sha256, `Missing/changed source: ${file.path}`)
    return { path: file.path, data }
  })
  const archive = zipFiles(files)
  ensure(sha256(archive) === profile.archiveSHA256, 'Curated source digest mismatch')
  return archive
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const profiles = {
      wix: ['wix-3.14.1-source-manifest.json', 'wix-3.14.1.zip'],
      nsis: ['nsis-3.11-source-manifest.json', 'nsis-3.11-source.zip'],
    }
    const selection = profiles[process.argv[3] ?? 'wix']
    ensure(selection, 'Select wix or nsis')
    const profile = JSON.parse(
      readFileSync(join(root, 'THIRD_PARTY_LICENSES/sources', selection[0]), 'utf8'),
    )
    ensure(
      process.argv[2],
      `Pass the upstream ZIP downloaded from ${profile.upstream.url} (${profile.upstream.sha256})`,
    )
    const archive = rebuildSourceSnapshot(readFileSync(resolve(process.argv[2])), profile)
    writeFileSync(join(root, 'THIRD_PARTY_LICENSES/sources', selection[1]), archive)
    console.log(
      JSON.stringify({
        files: profile.files.length,
        bytes: archive.length,
        sha256: sha256(archive),
      }),
    )
  } catch (error) {
    console.error(`Source snapshot validation failed: ${error.message}`)
    process.exitCode = 1
  }
}
