# Preserved third-party terms and corresponding source

The consolidated index is `../THIRD-PARTY-NOTICES.md`. In a Windows release, this
directory and that index are installed next to `mosaico.exe`. The installation
directory can be selected by the user; the paths inside it are stable.

- `native/`, `fonts/`, `installers/`, `webview2/`: original upstream legal texts.
- `npm/`, `cargo/`: legal texts copied from the installed, locked packages.
  This conservative set also preserves available build-tool notices; a file's
  presence here does not claim that the entire package is in the executable.
- `overrides/`: original texts retrieved from an identified upstream revision
  when the published package omitted its legal file. `overrides.json` explains
  their origin; no copyright holder or grant is invented.
- `sources/`: exact upstream archives for MPL-covered Eigen/Rust code, the complete
  NSIS root source tree without its redundant nested `trunk/` mirror, and the
  reviewed WiX UI source-only snapshot. The WiX
  selection keeps the complete UI extension/resources, dutil/wcautil libraries,
  shared source and build tooling with unchanged upstream file bytes. It omits
  unrelated extensions, documentation/test trees and compiled redistributables.
  The pinned upstream digest and retained file hashes are in
  `sources/wix-3.14.1-source-manifest.json`. The analogous NSIS manifest records
  every retained root-tree file; original terms/headers remain inside both ZIPs.
- `sources/mosaico-source.zip`: generated corresponding application source,
  delivered in both Windows installers. Its `SOURCE-MANIFEST.json` lists hashes
  for the included source, assets, build/install scripts and legal resources.
  The archive excludes dependencies/build caches, Git credentials and ignored
  local files. It does not require access to the private development repository.
- `dependency-sources.json`: locked public package archives and upstream source
  repositories needed with the supplied application source. Dependencies are
  acquired through the checked-in npm/Cargo locks and documented native pins;
  the application ZIP does not claim to contain all dependency implementations.
  Exact sources subject to the identified MPL/CPL/MS-RL delivery obligations are
  supplied physically in `sources/`. Keep public dependency sources available
  or mirror them when redistributing; private application access is not required.
- `WINDOWS-TERMS.txt` and `.rtf`: readable and installer-presented Microsoft
  component terms/disclosures. They apply to those Microsoft components, not
  to the AGPL-covered application.
- `components.json`: the Windows component decisions and concrete obligations.
- `inventory.json`: Windows dependency evidence, including non-shipped candidates.
- `distribution.json`: normalized text/binary digests and package notice coverage.
- `provenance.json`: retrieved upstream paths and original source-byte hashes.
  NSIS/WiX records distinguish original upstream digests from curated archive
  digests and link their per-file selection manifests.
  Text CRLF normalization in Git does not change a license; the distribution
  manifest normalizes CRLF for text and hashes archives/documents as binary.

## Versioning policy

| Content | Policy |
| --- | --- |
| Consolidated notices, this README, component decisions, provenance, overrides and original legal texts | TRACKED SOURCE OF TRUTH |
| Original Eigen/Rust source archives | TRACKED SOURCE OF TRUTH (pinned upstream source inputs) |
| `inventory.json`, `distribution.json`, `dependency-sources.json`, collected `npm/` and `cargo/` notices | GENERATED + TRACKED |
| NSIS/WiX source-only ZIPs and their per-file source manifests | GENERATED + TRACKED (reviewed upstream selections) |
| Application `mosaico-source.zip`, its receipt/internal manifest, bundle outputs, download caches and audit evidence | GENERATED + NOT TRACKED |

`mosaico-source.zip` is written only to `src-tauri/target/license-source/`, already
ignored by Git. Tauri maps it into `THIRD_PARTY_LICENSES/sources/` at bundle time;
no generated application ZIP is stored in this versioned directory.

To reproduce either selection, download the exact upstream URL recorded in its
source manifest to an ignored temporary path and run
`node scripts/license-source-snapshot.mjs <upstream.zip> wix` or the same command
with `nsis`. The script verifies the
upstream digest, every selected file and the deterministic output digest before
replacing the corresponding versioned ZIP. The NSIS selection preserves all
834 root-tree files; its omitted `trunk/` mirror repeats 833 files byte-for-byte
and differs only in the alternate menu ZIP packaging recipe. UI C++ projects
depend on the retained complete
dutil/wcautil sources and shared build scripts; Microsoft SDK/compiler and public
NuGet build tools remain external prerequisites. No vendor `.exe`/`.dll`, installer
fixture or private-key fixture is included in the source-only selection.

## Regeneration and checks

Use Node.js 24 and the repository's Rust toolchain. On Windows:

```sh
npm ci
node scripts/license-inventory.mjs
node scripts/license-inventory.mjs --check
node scripts/license-distribution.mjs prepare
npm run tauri -- build --target x86_64-pc-windows-msvc --bundles nsis,msi --config src-tauri/tauri.release.json
```

The generator uses the local npm installation and `cargo metadata --locked
--offline`; it does not download licenses or silently approve a new dependency.
An updated dependency requires reviewed legal inputs before regeneration succeeds.
Source archives and manually reviewed terms are versioned in this directory.
Input hashes exclude only mosAIco's own root-version fields, so the normal release
version bump does not require an unrelated legal-resource commit. Dependency
changes still invalidate the check; the source snapshot captures the real app version.
The application source snapshot normalizes only `src-tauri/Cargo.toml` to LF,
matching Tauri's Windows rewrite without changing the source. Other source/assets
keep their original bytes.

Normal CI runs `node scripts/license-inventory.mjs --check --source-only`.
That check uses only versioned inputs, works across platforms, needs no network,
Rust registry or native build, and checks every preserved file's content.

The release workflow prepares corresponding source before building and calls
`node scripts/license-distribution.mjs check --artifacts` before publication.
`ARTIFACT_PATHS` supplies the two build outputs. The same command accepts two
explicit installer paths for local inspection. It extracts both packages without
running an installer, resolves MSI target paths through the read-only Windows
Installer database, verifies all notice/source payload hashes, and rejects stale
or missing corresponding source. 7-Zip is needed only for artifact inspection.

Use the release configuration for distributable Windows bundles. Plain Rust
checks/tests keep their existing configuration and do not require generated
installer resources. From an extracted source archive without `.git`, the
preparation command uses `SOURCE-MANIFEST.json` to reconstruct the source payload.

`NEEDS SOURCE NOTICE` identifies a source-delivery obligation; the supplied exact
archives and source notices fulfill it for this distribution. It does not mean
that copyleft automatically blocks the separate application. The existing
`releaseScript.test.ts` CRLF/shebang test-loading issue remains a separate task.
