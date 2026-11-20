# Releasing mosAIco

Releases use a preparation branch, a normal pull request to protected `main`, and a separate post-merge tag operation. **Obtain the owner's explicit authorization before each commit, push, tag, or publication.** A preview does not authorize a real release.

## Version sources

`scripts/release.mjs` checks that these sources agree before either preparation or tagging:

| File | Purpose |
|---|---|
| `package.json` | Current application version |
| `package-lock.json` | Top-level and root package versions |
| `src-tauri/tauri.conf.json` | Application and installer version |
| `src-tauri/Cargo.toml` | Rust crate version |
| `src-tauri/Cargo.lock` | The `mosaico` package version |
| `src/lib/changelogData.ts` | First release entry shown in the interface |

Preparation uses `npm version <version> --no-git-tag-version --ignore-scripts --offline` to update npm's metadata through its supported command. It does not install or update dependencies, run lifecycle scripts, or let npm create a commit/tag. The script compares the entire parsed package and lockfile before and after, excluding only their root version fields. Any other change aborts preparation and restores the original six files before committing. The newly created release branch remains available for inspection after a failure.

## Step 1 — prepare a local release branch

Start from a clean `main` equal to both the local `origin/main` reference and live remote `main`, with the official repository configured as origin for fetch and push. Fetch and fast-forward first if needed. Untracked files also count as changes.

```sh
npm run release -- patch --dry-run # 1.7.5 -> 1.7.6, preview only
npm run release patch             # default bump; also accepts minor, major, or X.Y.Z
```

Preparation creates `release/v1.7.6`, aligns all six version sources (including the frontend release timestamp), stages only those files, and creates one `chore(release): v1.7.6` commit. It refuses existing local/remote release branches or tags, inconsistent version sources, and versions that do not increase.

The branch stays local. The script does not push, create a tag, open a PR, or publish. This keeps preparation independent of GitHub CLI and leaves branch review and submission explicit. Dry-run performs the same read-only Git/version preflights and prints `would create branch`, `would update`, and `would commit`, with no writes or Git mutations.

## Step 2 — submit and merge the normal PR

After reviewing the preparation commit and obtaining authorization, push only the release branch:

```sh
git -c push.followTags=false push -u origin release/v1.7.6
```

Open a PR from `release/v1.7.6` to `main` in GitHub. No CLI is required. Complete the normal required checks and merge using squash or rebase to preserve linear history. Do not bypass protection or recreate the version commit directly on `main`.

Review the changelog and version-specific release notes in a PR before tagging. The tag operation neither writes those notes nor merges a PR. After merge, switch to `main`, fetch, fast-forward, and wait for the **push-triggered CI run on that exact main commit** to complete successfully, including Frontend and Windows/Linux Rust checks.

## Step 3 — tag the reviewed main commit

With separate authorization to create/push the tag and start publication:

```sh
npm run release:tag -- 1.7.6 --dry-run
npm run release:tag -- 1.7.6
```

This operation requires clean `main`, equality with local and live `origin/main`, explicit version `1.7.6`, consistent version files, no existing local or remote `v1.7.6`, and successful main CI for the exact HEAD. It checks remote main again after the CI lookup, creates an annotated tag at that HEAD, and pushes **only** `refs/tags/v1.7.6:refs/tags/v1.7.6` with automatic following of other tags disabled. It never commits or pushes a branch.

The CI lookup uses `GH_TOKEN` or `GITHUB_TOKEN` with repository Actions read access through the GitHub API. For this private repository, a credential is necessary. If neither variable is set, the script uses an authenticated `gh api` as a convenience fallback. Thus `gh` is optional for the fundamental flow; the token/API path needs only Node.js, npm, and Git. Credentials are not printed. Authentication, API, rate-limit, parsing, or incomplete-response failures abort before tagging. The successful push-triggered main run must contain exactly one completed, successful job named `Frontend (typecheck + build)`, `Rust check (Windows)`, and `Rust check (Linux)`, each on HEAD and belonging to that run's current attempt. A successful workflow with a missing or skipped required job is insufficient.

If the tag push fails after local creation, inspect the local tag and remote state before deciding how to recover; the command deliberately refuses an existing tag on a later attempt. Never move or force-push a release tag.

## Step 4 — draft, verify, then publish

The `v*` tag starts `.github/workflows/release.yml`. One Windows x64 job performs this sequence:

1. Check out the event SHA, validate all version sources against the triggering tag, require an annotated tag pointing at the checked-out commit and present in `main`, and compare the live remote tag object.
2. Find the existing release by exact tag, including drafts. An already published release ends the run without uploads, edits, or publication. Require nonempty `docs/releases/<tag>.md` before creating or reusing a draft. Missing notes fail the run; a generic body is never published.
3. Create a draft with `gh release create --draft --verify-tag` only if none exists. Pass its explicit ID to pinned `tauri-action`, with `releaseDraft: true`, to build/upload only Windows x64 NSIS and MSI bundles.
4. Require exactly the two current-build installer names, correct version/architecture, uploaded state, and nonzero matching sizes. Compare API SHA-256 digests when supplied, download both assets, and compare their SHA-256 hashes with the local files from this build.
5. Apply the reviewed notes with `gh release edit --notes-file`, read back the exact body while the release is still a draft, recheck the remote tag, then publish with `gh release edit --draft=false --verify-tag`.

`scripts/release-assets.mjs` implements these workflow checks using the runner's preinstalled GitHub CLI and its scoped `GITHUB_TOKEN`. All steps before the last publication operation leave the release unpublished on failure. A published release event may trigger GitHub notifications; installer verification and notes application therefore happen before that operation.

## Reruns and failure recovery

The workflow concurrency group serializes attempts for the same tag without cancelling an upload. It uses the same release ID instead of allowing the build action to discover/create another release. Duplicate releases for a tag cause failure.

Rerun a failed workflow through GitHub Actions. While the release remains a draft, the pinned Tauri action replaces same-name assets with the current build's files. Publication rechecks the entire asset set and downloaded hashes, so stale extra assets, partial uploads, or mismatched files block publication. If publication already completed, a full rerun skips the build and leaves the published release untouched; a retry of the final step also exits without modifying it. A failed upload/build/verification leaves a recoverable draft. Do not manually upload or edit assets while a run is active.

These safeguards coordinate this workflow; they do not lock out an owner manually changing releases/tags through another client. Moving tags is unsupported, and a changed remote tag fails verification.

## Release notes

Before tagging, write `docs/releases/v<version>.md` for readers of the release page and merge it through a PR. Group user-visible changes by area, explain upgrade steps, and link to `docs/CHANGELOG.md` for the full history. Record changes under `[Unreleased]` when made. Prepare the dated section and a new empty `[Unreleased]` before release. The preparation script only inserts the frontend's release identity; it does not rewrite the Markdown changelog or author release notes.

## Signing and platform status

`src-tauri/tauri.release.json` disables updater artifact generation. The release workflow also disables updater JSON uploads, does not require signing secrets, does not produce `latest.json`, and does not code-sign Windows installers. Application auto-update remains unconfigured.

Linux remains in source and normal Rust CI, but Linux binaries are temporarily unavailable while the GTK/WebKitGTK dependency chain is reviewed. No macOS binaries are built. Before public macOS distribution, see [platform readiness](PLATFORM_READINESS.md) for native validation, Developer ID signing, notarization, and Ghostty preparation. Automatic updates require separate implementation and verification.

## Checklist

The [third-party notices](../THIRD-PARTY-NOTICES.md) and the complete
`THIRD_PARTY_LICENSES/` directory are bundled through the supported Tauri release
configuration. The workflow prepares a corresponding-source ZIP before building,
then verifies original legal texts, source archives and target paths inside both
NSIS and MSI before the publication step. Microsoft component terms/disclosures
are presented on the installers' license page and remain available after install.

After a dependency/license change, run `npm ci`,
`node scripts/license-inventory.mjs`, and
`node scripts/license-inventory.mjs --check`; review and include the generated
legal resources with the dependency change. Own application version-only bumps
do not alter the third-party input hashes. Normal CI runs the fast, offline
`--check --source-only` mode without Cargo caches or a native build.

For a local distributable Windows build, run
`node scripts/license-distribution.mjs prepare` followed by the existing Tauri
build command with `--config src-tauri/tauri.release.json`. Inspect the outputs
with `node scripts/license-distribution.mjs check --artifacts <nsis.exe> <msi.msi>`.
This uses 7-Zip and the read-only Windows Installer API; it does not run an
installer. The installed paths are `<INSTALLDIR>/THIRD-PARTY-NOTICES.md` and
`<INSTALLDIR>/THIRD_PARTY_LICENSES/`, next to `mosaico.exe`. See the legal directory's
[README](../THIRD_PARTY_LICENSES/README.md) for source availability and regeneration.
The existing Windows `releaseScript.test.ts` CRLF/shebang baseline remains a
separate follow-up and must not be confused with a legal-payload validation failure.

1. Validate the changes with `npm test`, `npm run build`, and the applicable Rust checks.
2. Review changelog and version-specific notes; confirm clean, synchronized `main` and official origin.
3. Preview preparation; with authorization, prepare locally and review the single commit.
4. With authorization, push the release branch and open the normal PR; satisfy protection and merge.
5. Synchronize local main and wait for successful CI on its exact SHA.
6. Preview tagging; with authorization, push only the annotated tag.
7. Confirm the workflow verified both Windows installers and applied notes before publication.
