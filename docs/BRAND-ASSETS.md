# Visual asset provenance and brand decisions

Audit date: **2026-11-19**. Application **1.7.5**.
This records an engineering publication decision, not an absolute legal opinion or
a grant of rights from any brand owner. Software licenses and trademark permission
are separate questions.

The current working tree uses neutral category icons and factual product names.
It contains no standalone third-party product logo. The remote companion uses its
existing text badges. Unknown legacy artwork is removed rather than redrawn.
This audit covers visual brand assets in the **current tracked source tree**.
The per-file content hashes and source paths in the ledger identify the audited
artwork without depending on a particular Git history. See [Publication limits](#publication-limits).

## Preparation and scope

The ledger records retained source paths, SHA-256 digests, official source URLs,
licenses, trademark guidance and use decisions. Removed artwork is identified by
its former path and content hash, without retaining its bytes. Validation methods
and results are recorded below; no repository access or earlier review is needed
to interpret the inventory.

The inventory covers every tracked SVG, PNG, ICO, ICNS, BMP and TTF; React and remote
inline SVG paths; CSS data URLs; imports/globs; Rust `include_bytes!`/`include_str!`;
HTML, manifests, installer/build configuration and documentation image references.
There is no `public/` directory, standalone icon webfont other than Nerd Fonts, or
tracked JPEG, GIF, WebP or WOFF asset. Generic chart paths, QR codes and data-derived
graphics are not vendor logos. Source archives of third-party build tools remain
dependency source, not mosAIco UI artwork; their existing license coverage is unchanged.

Classification is one of `CLEAR`, `PERMITTED WITH CONDITIONS`, `ATTRIBUTION REQUIRED`,
`UNCERTAIN`, `REPLACE BEFORE PUBLIC`, `NOT DISTRIBUTED`. `OWNED / PROJECT ASSET` is a
separate ownership label, not a substitute for the classification.

## Legacy brand inventory and disposition

Paths below are relative to the repository. "Before" describes the retired use,
not a newly built installer. "After" describes the current source tree. `F` means the
frontend import graph; `R` means direct Rust embedding. Both reach the executable
and future NSIS/MSI payloads. All tracked files also enter the release's exact
corresponding-source archive, even if unused at runtime.

| Brand / asset | Audited file or symbol | Provenance / copyright | Trademark evidence | Before distribution | Classification and decision |
| --- | --- | --- | --- | --- | --- |
| Claude / Claude Code | `src/assets/claude-code.png`; `ClaudeIcon` | Orange pixel mascot; original download, revision, license and modification history unproved | [Anthropic guidelines](https://www.anthropic.com/legal/trademark-guidelines), [Claude Code product guidance](https://code.claude.com/docs/en/legal-and-compliance) | Source + F + R + EXE + NSIS/MSI | **REPLACE BEFORE PUBLIC**: remove PNG; use Lucide `MessageSquare`. Plain-text integration identification retained. |
| OpenAI / Codex | `src/assets/codex.png`; `CodexIcon` | Blue/purple terminal-cloud image, **not the OpenAI Blossom**; no demonstrated official origin or redistribution license | [OpenAI brand](https://openai.com/brand/) | Source + F + R + EXE + NSIS/MSI | **REPLACE BEFORE PUBLIC**: remove PNG; use `Code2`. Mentioning Codex does not license this image. |
| Kiro CLI (Amazon/AWS) | `src/assets/kiro.svg`; `KiroIcon` | Ghost SVG; original URL/revision and file grant unproved | [Kiro license](https://kiro.dev/license/), [AWS trademarks](https://aws.amazon.com/trademark-guidelines/) | Source + F + EXE + NSIS/MSI | **REPLACE BEFORE PUBLIC**: remove SVG; use `ListChecks`. |
| Google Antigravity | `src/assets/antigravity.png`; `AntigravityIcon` | Multicolor A-shaped PNG; product identity established by installer URL/CLI mapping, original PNG acquisition unproved | [Official product](https://antigravity.google/), [press assets](https://antigravity.google/press), [Google guidance](https://about.google/brand-resource-center/guidance/) | Source + F + EXE + NSIS/MSI | **REPLACE BEFORE PUBLIC**: remove PNG; use `Rocket`. Public press downloads alone do not prove this file's origin or this app's right to redistribute it. |
| Freebuff | `src/assets/freebuff.png`; `FreebuffIcon` | Rounded terminal/star image; no official-file match, revision or explicit asset license established | [Freebuff product](https://freebuff.com/), [terms](https://freebuff.com/terms-of-service) | Source + F + EXE + NSIS/MSI | **REPLACE BEFORE PUBLIC**: remove PNG; use `Terminal`. |
| Visual Studio Code | `src/assets/vscode.svg`; `VSCodeIcon` | Multicolor path reconstruction with masks/filter/gradient; no source URL or asset license | [VS Code rules](https://code.visualstudio.com/brand), [Microsoft rules](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks) | Source + F + EXE + NSIS/MSI | **REPLACE BEFORE PUBLIC**: remove SVG; use `Code2` for the existing editor action. |
| OpenCode (Anomaly) | `src/assets/open-black.png`, `open-white.png`; `OpenCodeIcon` | Local bitmaps not tied to an official revision; upstream code is MIT, which does not authenticate these bitmaps | [Brand](https://opencode.ai/brand), [upstream](https://github.com/anomalyco/opencode), [license](https://github.com/anomalyco/opencode/blob/dev/LICENSE) | Source + F; white variant also R; EXE + NSIS/MSI | **REPLACE BEFORE PUBLIC**: remove both; use `Braces`. Official 4:5 ratio, minimum 16×20px and clear-space requirements conflict with existing square 12–16px controls. |
| GitHub Copilot | Inline `CopilotIcon` in `src/components/icons/AgentIcons.tsx` | Comment attributes paths to Primer Octicons MIT; acquisition revision absent. MIT requires copyright/permission notice and permits modification | [GitHub brand](https://brand.github.com/foundations/logo), [Copilot brand](https://brand.github.com/brand-identity/copilot), [Octicons MIT](https://github.com/primer/octicons/blob/main/LICENSE) | Source + F + EXE + NSIS/MSI | **REPLACE BEFORE PUBLIC**: remove copied paths; use generic `Bot`. The Octicons software grant is not unrestricted Copilot trademark permission. |
| GitHub / Octocat | `Github` from `lucide-react` in Home, Onboarding and Sync | Version 0.460.0; package license already preserved; Lucide provenance does not grant GitHub trademark rights | [GitHub brand](https://brand.github.com/foundations/logo), [policy](https://docs.github.com/en/site-policy/content-removal-policies/github-trademark-policy) | Source imports + F + EXE + NSIS/MSI | **REPLACE BEFORE PUBLIC**: use generic `GitBranch` at every call site. Do not treat a stylized Octocat copy as an official unmodified brand asset. |
| Cursor (Anysphere) | Inline `CursorIcon` | Source explicitly described a redraw of Cursor's cube, with changed strokes/accent colors; no independent logo grant | [Official brand](https://cursor.com/brand) | Source + F + EXE + NSIS/MSI | **REPLACE BEFORE PUBLIC**: remove cube reconstruction; use generic `MousePointer2`. |
| Kimi Code (Moonshot AI) | Inline `KimiIcon` | Source described a redrawn Kimi mark; no evidence establishing a grant for that reconstruction | [Official product docs](https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html) | Source + F + EXE + NSIS/MSI | **REPLACE BEFORE PUBLIC**: replace K-in-square reconstruction with generic `Keyboard`. CLI software licensing is not logo approval. |
| MiMo (Xiaomi) | Inline `MimoIcon` | Simple M-in-square project monogram, not an imported Xiaomi/MiMo logo; no external image used | [Product identity](https://mimo.xiaomi.com/) | Source + F + EXE + NSIS/MSI | **CLEAR**, **OWNED / PROJECT ASSET**: retain the plain project monogram, without claiming ownership of the MiMo name. |
| Gemini (Google) | Lucide `Sparkles` | Ordinary multiple-sparkles category icon from the locked Lucide package, not the Google Gemini logo | [Google guidance](https://about.google/brand-resource-center/guidance/) | Source import + F + EXE + NSIS/MSI | **ATTRIBUTION REQUIRED**: retain neutral icon; existing Lucide notice applies. No Google color mark or four-point brand reconstruction introduced. |
| WSL / shell | Inline `WslIcon`, `ShellIcon` | Generic terminal geometry, no Windows, Linux or distribution logo | [Microsoft rules](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks) apply to names, not a claim that this geometry is a vendor mark | Source + F + EXE + NSIS/MSI | **CLEAR**, **OWNED / PROJECT ASSET**: retain generic drawings. |
| Spotify / other integrations | Generic Lucide music/cloud/link/file icons | No static Spotify, Docker, Slack, Figma or other integration logo found; file types use generic category icons | No vendor-logo permission inferred | Generic UI symbols only | **ATTRIBUTION REQUIRED** for Lucide; retain. User-supplied art is separate below. |

For every replaced file, its original acquisition remains **unknown**. No exact
upstream source or redistribution permission was established, and no upstream
revision is inferred from visual similarity. The JSON ledger retains the removed
file paths and content digests without retaining image bytes.

### Conditions for names and potential official-logo replacements

- **Claude Code:** product guidance permits accurate plain-text identification of
  running Claude Code. Logos and other uses require written permission; approved
  images must preserve supplied geometry/colors and spacing. There is no demonstrated
  Anthropic approval for this app's old mascot file. A neutral symbol plus the product
  name is retained, never a partnership lockup or an app/feature name derived from it.
- **OpenAI / Codex:** factual integration labels remain distinct from mosAIco's own
  identity. Official OpenAI logos carry revocable, nontransferable conditions,
  ownership acknowledgment, spacing and no-alteration rules. No claim is made that
  those terms authenticate the removed terminal-cloud bitmap or license it as AGPL.
- **Kiro:** `src/lib/agentInstall.ts` points to `kiro.dev/cli/` and `cli.kiro.dev`;
  the command is `kiro-cli`. Kiro's license identifies Amazon/AWS. AWS's policy
  explicitly lists Kiro, allows nonconfusing factual plain-text fair use, and
  separately restricts supplied logo images and trade dress. No ghost SVG grant
  was demonstrated, so an official-looking file is not kept merely because it exists online.
- **Antigravity:** the project maps it to Google's `agy` CLI and official install
  endpoints. The current press site supplies artwork, but no license tying the
  legacy PNG to a permitted third-party application distribution was demonstrated.
  Product availability and press access are not a blanket artwork grant.
- **Freebuff:** the `freebuff` npm launcher and built-in provider explain why the
  logo existed. Its [official identity statement](https://freebuff.com/blog/is-freebuff-legit)
  identifies Freebuff, Inc. and the Codebuff team. The service terms reserve company content beyond
  granted uses; open-source CLI terms do not prove permission for the local PNG.
  No integration-specific artwork grant was found in the primary sources consulted.
- **VS Code:** Microsoft's general policy separates factual compatibility names
  from logos requiring authorization. The product rules allow particular editorial
  and linking uses, prohibit redraws/modified variants and require clear space.
  Approved editor action wording is retained; a neutral code icon avoids depending
  on an unproved file license or stretching those exceptions.
- **OpenCode:** the exact project is `anomalyco/opencode`, distributed as
  `opencode-ai`. Official brand rules identify Anomaly's marks, permit integration
  identification with conditions, prohibit misleading sponsorship and constrain
  artwork colors, ratios and size. An official logo would require a layout change;
  neutral braces preserve the current controls. Upstream MIT terms are not a
  trademark waiver and do not establish where the removed bitmaps came from.
- **GitHub, Copilot and Octicons:** GitHub brand guidance and software-icon licensing
  are independent. Primer's MIT license requires notices for copied paths. The
  inline Copilot copy is removed; no new standalone Octicons attribution is needed
  for that removed copy. Current Copilot guidance also retires standalone mascot-head
  imagery; a historical MIT path does not override that brand instruction. Octicons
  embedded in Nerd Fonts remain separately credited.
- **Cursor / Kimi:** official product identity does not authorize local logo redraws.
  The replacement symbols are ordinary pointer/keyboard categories; they do not
  imitate the old cube or K mark. No blanket vendor-logo permission is asserted.

All retained vendor names identify the corresponding external tool or action in
ordinary UI text. They do not name mosAIco, imply certification, sponsorship or
endorsement, or transfer trademark rights. For brands without an explicit naming
grant located here, this is a limited factual-reference decision, not a claim of
contractual permission for every possible use.

## Retained assets, licenses and attribution

[`brand-assets.json`](brand-assets.json) enumerates each retained file with its
SHA-256, provenance group, metadata result and distribution paths, plus each removed
file's old digest. Group metadata applies to **every** member, avoiding repeated
license blocks. The audit considered **140** image/font files; **11** are
removed (eight brand files and three unused drawings). **129** remain.
Retained SVG digests normalize CRLF to LF so Windows and Linux Git checkouts agree;
binary assets and the historical removed-file digests retain exact-byte hashes.
Frontend byte-match fields record the audited Windows build, independently of that
source-text normalization.

| Group | Files / provenance | Classification / copyright | Trademark / attribution decision |
| --- | --- | --- | --- |
| mosAIco generated artwork | All 124 tracked raster/container outputs under `src/assets/theme-icons/`, `src-tauri/icons/`, `src-tauri/installer/*.bmp`, plus home/loading/logo PNGs. Generator: [`scripts/generate-mosaico-branding.ps1`](../scripts/generate-mosaico-branding.ps1); per-file hashes in the ledger | **CLEAR**, **OWNED / PROJECT ASSET**. Project geometry, copyright 2026 Schubert Araujo as recorded by `NOTICE` | Project branding reserved under `TRADEMARK.md`; not third-party notices. Even `theme-icons/**/vscode.png`, `dracula.png`, `nord.png`, etc. contain the mosAIco mark, not those products' logos. |
| mosAIco vector mark / wordmark | `src/assets/mosaico-mark.svg`; `docs/BRAND.md`; UI wordmark | **CLEAR**, **OWNED / PROJECT ASSET**. Same project geometry and ownership notice | Project branding policy; no third-party mark or special logo font imported. Installer lettering is generated with the Windows system font, not a distributed font file. |
| Generic project drawings | Shell/WSL/MiMo SVG geometry in `AgentIcons.tsx`, charts, graph edges, CSS chevron, remote text badges | **CLEAR**, **OWNED / PROJECT ASSET** for generic project geometry; adapted generic Lucide/Feather geometry retains existing package attribution | No vendor-logo claim. Neutral letters do not copy a stylized vendor wordmark. |
| Neutral category icons | `lucide-react` **0.460.0**, installed package sources and locked integrity; new symbols listed below | **ATTRIBUTION REQUIRED**. Locked package ISC notice credits Lucide and Feather/Cole Bemis portions; redistribution/modification permitted subject to preserved notice | [Lucide license](https://lucide.dev/license), [brand statement](https://lucide.dev/brand-logo-statement). Preserve the already approved `THIRD_PARTY_LICENSES/npm/lucide-react-0.460.0/LICENSE`; no new package/version or duplicate notice. |
| Font and embedded icon glyphs | Four unchanged `src/assets/fonts/CaskaydiaCoveNerdFontMono-*.ttf`; official Nerd Fonts **3.5.0**, Cascadia **2407.24** | **ATTRIBUTION REQUIRED**. OFL-1.1 plus the supplied glyph-source terms | See [`fonts/ATTRIBUTION.md`](../THIRD_PARTY_LICENSES/fonts/ATTRIBUTION.md), pinned digests/URLs in [`provenance.json`](../THIRD_PARTY_LICENSES/provenance.json). Includes Octicons 18.3.0, Codicons, Devicon, Font Awesome, Font Logos, Material Design, Seti and the other documented sets. These are terminal font glyphs, not host UI logo replacements or a trademark waiver. |
| Unused legacy drawings | Removed `src/assets/default-profile.svg`, `shell.svg`, `terminal.svg`, and unused `icons.ts` map | **NOT DISTRIBUTED** after removal. Before removal, source/corresponding-source exposure existed; unused map entries could also retain shell/terminal bytes in a bundle. Shell geometry matches Lucide Terminal; the other drawings lack a separate acquisition record | Remove unreferenced drawings/map rather than declare unknown artwork exclusively project-owned. No UI behavior lost. |

The new category mapping is Claude→`MessageSquare`, Codex/editor→`Code2`,
Freebuff→`Terminal`, Kiro→`ListChecks`, OpenCode→`Braces`, Cursor→`MousePointer2`,
Antigravity→`Rocket`, Copilot→`Bot`, Kimi→`Keyboard`, GitHub actions→`GitBranch`.
Gemini keeps generic `Sparkles`. New icons inherit `currentColor` and existing tokens;
no brand colors, new styles, visible strings, naming or launcher behavior are added.
There are **no new raster assets, copied official logos, dependencies or license texts**.

### Runtime content outside the shipped asset set

User-selected profile/project images, downloaded favicons (origin or DuckDuckGo
fallback), GitHub avatars, Spotify album covers, plugin-provided icons and terminal
output can display third-party artwork. They are **NOT DISTRIBUTED** as fixed
application/source assets in this tree. Their URLs and image bytes depend on user
data or runtime services; this audit does not license that content or certify
third-party plugin packages. Font glyph availability likewise does not authorize
the app to promote a vendor using a mark. No user account, cache, credential or
application data was collected for this audit.

## Distribution evidence

- **Source exposure:** every retained image/font is enumerated in the JSON ledger.
  Removed files are absent from the tracked source tree.
- **Frontend:** `npm run build` produces `dist`. The ledger distinguishes observed
  output files and decoded inline data URLs from source-only files; filenames alone
  are insufficient because Vite embeds small PNGs/SVGs as data URLs. Neutral React
  icons become SVG geometry in JavaScript. No old image digest or Copilot/Cursor/Kimi
  logo path should remain in those outputs.
- **Executable:** `src-tauri/tauri.conf.json` embeds `../dist`. Direct Rust embeddings
  additionally include the four font files, four selected theme masters in
  `remote/appearance.rs` and the 128px window icon in `lib.rs`. The old three agent
  PNG routes and `include_bytes!` references in `remote/http.rs` are removed.
  ICO branding also enters Windows executable resources via Tauri configuration.
- **NSIS / MSI:** both package the executable. NSIS additionally uses the project
  ICO and the two generated BMPs; the configured icon set feeds platform bundlers.
  The exact corresponding-source ZIP includes **all tracked assets**, including
  unused Android/iOS/ICNS assets. Thus "not a Windows runtime asset" does not mean
  "not distributed in a Windows installer". Per-file ledger labels distinguish
  `binary`, `installer-artwork` and `corresponding-source-only` paths.
- **Evidence limit:** no new Windows executable or installer is claimed here.
  `cargo check` verifies compilation, not final linked payloads. Existing local
  artifacts, if any, are stale and must not be published as this revision. After an
  authorized commit, the normal approved build must regenerate corresponding
  source, executable and both installers and pass the existing artifact validator.
  Release architecture is unchanged. The current source generator expects tracked
  files, so invoking it against pending deletions is not proof of a future package.

The checked production output contains byte-equivalent copies of **63** retained
files, including decoded inline data URLs. The mosAIco vector mark is also present
as a transformed inline SVG, verified by its element geometry and attributes rather
than a byte hash. **None of the 11 removed image hashes or retired SVG geometries**
was found. The old inline Copilot, Cursor and Kimi paths and Lucide `Github` component
are also absent from production JavaScript. Five further retained files have direct
Rust/resource inclusion without a frontend match; **60** are source-only for the
executable analysis, but still go into corresponding source. Inclusion fields in the
JSON ledger are explicitly labeled as configuration inference for binaries/installers.

## Metadata and project authorship evidence

All 126 pre-change PNGs were inspected by chunk type: only structural/rendering
chunks, **no tEXt, zTXt, iTXt or eXIf**. All retained SVGs (the project mark) have no
editor metadata, comments, local paths, private URLs, unused IDs, scripts, external
references or embedded foreign objects. Font name/copyright tables are legitimate
upstream licensing metadata and are preserved unchanged.

The branding generator was copied with its inputs into a temporary directory and
run there. **All 126 available generated outputs matched the current bytes**, of
which **124 are tracked**; two additional locally generated outputs are not part of
the tracked inventory. This verifies the retained PNG/ICO/ICNS/BMP geometry against
the actual generator using content comparison. The SVG
mark expresses the same modular geometry. No image-generation service, external
reference image or unlicensed brand redraw is required by that generator.

## Publication limits

The visual brand blockers in the **current tracked source tree** are resolved.
Removed artwork remains **UNCERTAIN** in copyright/provenance and must not be
reintroduced into source archives, bundles or installers. Removal is not a license
grant for those bytes, nor does it certify the entire application as release-ready.

Publish only source and binaries that pass the current inventory and distribution
checks. Rebuild corresponding source, executable and installers together; stale
artifacts or user/runtime artwork are outside this audit's evidence.

## Maintaining this inventory

1. Before adding a static image, inline vendor path, icon font, brand package or
   remote-embedded asset, record its official URL, exact bytes/revision, copyright
   license, required attribution and independent trademark decision in this ledger.
2. Prefer an official asset only when the exact use and geometry are demonstrably
   permitted. Otherwise use a licensed category icon or plain text; never imitate a logo.
3. Add every new file and digest to `brand-assets.json`, including source-only files.
   Keep unknown acquisitions out of the distributable tree. Do not copy private paths
   or user metadata into provenance records.
4. Recheck owner guidelines when restoring a brand logo or preparing publication;
   a dated audit is not permanent permission. Run `npm test`, `npm run build`, lint,
   Rust checks and the normal installer/source validators for the target revision.
5. Keep dependency/license texts in `THIRD_PARTY_LICENSES/` and its distribution mechanism. This document
   owns visual provenance and trademark decisions; it does not silently relicense
   logos under the app's AGPL or duplicate the dependency notices.

## Validation and change inventory

Validated on Windows on **2026-11-19**:

| Check | Result |
| --- | --- |
| `npm ci` | Passed; 979 packages installed; dependency manifests and lockfiles unchanged |
| `npm test` | 94 suites passed, **734 tests passed**; one suite failed to load: unchanged `src/lib/releaseScript.test.ts`, `SyntaxError: Invalid or unexpected token` (known Windows CRLF/shebang/Vite SSR baseline) |
| Icon regressions | Every one of the 13 built-in types renders at 12, 16 and 24px in dark/light themes: 78 configurations; editor and unknown-provider fallback also render without image requests. Remote Claude/Codex rows retain their text badges and agent identity |
| Provenance regressions | All 129 remaining image/font files are registered and hash-checked; all 11 retired image paths are absent; retired remote image routes/embeddings are absent |
| `npm run build` | Passed, including TypeScript/i18n; Vite's existing large-chunk warning remains |
| `npm run lint` | Passed: 0 errors, 148 warnings in the repository |
| `cargo check --locked` | Passed with the existing MSVC/Rust toolchain; 16 warnings |
| `git diff --check` | Passed |
| `node scripts/license-inventory.mjs --check --source-only` | Passed offline; versioned inventory/legal resources remain current |
| Asset metadata / generator | No PNG text/EXIF chunks; retained vector clean; 126 available generated outputs match (124 tracked) |
| Production image bytes | 63 retained file digests plus the transformed mosAIco SVG observed; zero retired file digests or SVG geometries observed, including inline data URLs |

No dependency or release-script change was made to suppress the baseline failure.
There was no new interactive app launch, restart or stop. Runtime verification is
by rendering tests and build evidence; no claim of interactive Windows installer QA
or newly inspected NSIS/MSI payloads is made.

**Decision: BRAND ASSET BLOCKER RESOLVED for the current repository tree.**

All official web links in this document were consulted **2026-11-19**. Negative
findings mean that sufficient evidence was not established in these sources,
not that permission could never be obtained. The local source and font/package
notices remain the evidence for the exact locked bytes.
