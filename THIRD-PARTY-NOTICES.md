# Third-party notices — Windows distribution

mosAIco remains **AGPL-3.0-or-later**. Third-party components retain their own terms. This index covers the Windows x64 release configuration after the Sherpa 2.0.1 migration (main PR #39).

The index and the complete THIRD_PARTY_LICENSES directory are installed next to mosaico.exe. Their stable paths are <INSTALLDIR>/THIRD-PARTY-NOTICES.md and <INSTALLDIR>/THIRD_PARTY_LICENSES/. The installer lets the user choose INSTALLDIR.

The exact corresponding application source is included as THIRD_PARTY_LICENSES/sources/mosaico-source.zip. It contains source, assets, build/install scripts, legal resources and a file-hash manifest. It works without access to the private development repository; no repository visibility change is required. Model weights are downloaded separately and are not in the installer.

## Component classification

CLEAR means no additional notice/source restriction was identified for that item. CLEAR WITH NOTICE means its required original texts/attribution are supplied. NEEDS SOURCE NOTICE identifies a source-delivery obligation fulfilled by the accompanying exact source archives and original terms. UNKNOWN or BLOCKER would stop the release validator; neither remains among the identified redistributed components. These labels describe the concrete distribution, not an automatic prohibition on copyleft.

| Component | Version | License | Redistributed | Notice/source necessary | Status |
| --- | --- | --- | --- | --- | --- |
| mosAIco | application version in package.json / SOURCE-MANIFEST.json | AGPL-3.0-or-later | Windows binary/installer | The full corresponding application source is installed as sources/mosaico-source.zip; it includes build/install scripts, legal resources and a content manifest. The AGPL remains the application license. | NEEDS SOURCE NOTICE |
| Sherpa ONNX C API/core | 2.0.1 | Apache-2.0 | Windows binary/installer | Preserve the supplied original copyright/license/NOTICE texts. | CLEAR WITH NOTICE |
| ONNX Runtime | 1.28.2 | MIT + dependency notices | Windows binary/installer | Deliver the complete upstream ThirdPartyNotices; the exact Eigen source selected by this ONNX build is supplied alongside its MPL notice. | NEEDS SOURCE NOTICE |
| utf8proc | 2.12.0 | MIT + Unicode data terms | Windows binary/installer | Preserve the supplied original copyright/license/NOTICE texts. | CLEAR WITH NOTICE |
| kaldi-native-fbank | 1.22.4 | Apache-2.0 | Windows binary/installer | Preserve the supplied original copyright/license/NOTICE texts. | CLEAR WITH NOTICE |
| kaldi-decoder | 0.3.0 | Apache-2.0 | Windows binary/installer | Preserve the supplied original copyright/license/NOTICE texts. | CLEAR WITH NOTICE |
| kaldifst | 1.8.0 | Apache-2.0 | Windows binary/installer | Preserve the supplied original copyright/license/NOTICE texts. | CLEAR WITH NOTICE |
| OpenFST / fstfar | 1.8.5-2026-07-09 | Apache-2.0 | Windows binary/installer | Preserve the supplied original copyright/license/NOTICE texts. | CLEAR WITH NOTICE |
| KissFFT | febd4caeed32e33ad8b2e0bb5ea77542c40f18ec | BSD-3-Clause | Windows binary/installer | Preserve the supplied original copyright/license/NOTICE texts. | CLEAR WITH NOTICE |
| simple-sentencepiece / darts / threadpool | 0.7 | Apache-2.0 / BSD-2-Clause / Zlib | Windows binary/installer | Preserve the supplied original copyright/license/NOTICE texts. | CLEAR WITH NOTICE |
| Eigen (Sherpa headers) | 5.0.1 | MPL-2.0 | Windows binary/installer | Unmodified exact source archive and original notices are supplied. MPL applies to covered files; it does not relicense the separate application. | NEEDS SOURCE NOTICE |
| nlohmann JSON | 3.12.0 | MIT | Windows binary/installer | Preserve the supplied original copyright/license/NOTICE texts. | CLEAR WITH NOTICE |
| CaskaydiaCove / Nerd Fonts | Cascadia 2407.24 / Nerd Fonts 3.5.0 | OFL-1.1 / CC-BY-4.0 / MIT / Apache-2.0 / Bitstream Vera / Unlicense | Windows binary/installer | Preserve base-font and glyph notices. Nerd Fonts merged, scaled/remapped glyphs and renamed the preprocessed Cascadia family; mosAIco uses the four upstream patched TTFs unchanged. Attribution and changes are documented in fonts/ATTRIBUTION.md. No trademark permission is inferred. | CLEAR WITH NOTICE |
| Microsoft WebView2 Evergreen bootstrapper | NSIS 1.3.275.13 / MSI 1.3.315.17 | Microsoft proprietary runtime terms | Windows binary/installer | Microsoft distribution terms and SmartScreen/update disclosures are supplied and presented through the supported NSIS/MSI license agreement page. Microsoft binaries remain separate from the AGPL license. | CLEAR WITH NOTICE |
| NSIS runtime/plugins/LZMA | 3.11 | Zlib / CPL-1.0 with LZMA linking exception | Windows binary/installer | Original notices, the CPL text/linking exception and the complete upstream root source/build/resource tree are supplied with a per-file manifest. Only a redundant nested trunk mirror is omitted. The exception permits linking without applying CPL to the application. | NEEDS SOURCE NOTICE |
| nsis-tauri-utils | 0.5.3 | MIT OR Apache-2.0 | Windows binary/installer | Preserve the supplied original copyright/license/NOTICE texts. | CLEAR WITH NOTICE |
| WiX UI custom action | 3.14.1 | MS-RL | Windows binary/installer | The unmodified UI extension/resources, dutil/wcautil and shared source/build files are supplied in a reviewed source-only snapshot with MS-RL terms and a pinned per-file manifest. Unrelated binary redistributables and test fixtures are excluded. File-level reciprocity applies to covered helper files, not the separate app. | NEEDS SOURCE NOTICE |
| Rust CSS/selector/formatting helpers | cssparser 0.36.0; macros 0.6.1; selectors 0.36.1; dtoa-short 0.3.5; option-ext 0.2.0 | MPL-2.0 | Windows binary/installer | The exact registry source crates and full original notices are supplied conservatively, including build/generated-output candidates. No modified covered file is asserted. | NEEDS SOURCE NOTICE |
| Ghostty adapted source | project adaptation; upstream MIT notice pinned | MIT | Source archive only | MIT attribution for adapted shim/source is retained in the supplied application source. GhosttyKit is not a Windows binary dependency. | CLEAR WITH NOTICE |
| SQLite | 3.45.0 | Public domain | Windows binary/installer | No license/source restriction is imposed by the SQLite authors; the original blessing is preserved. | CLEAR |
| Zstandard | 1.5.7 (zstd-sys 2.1.2) | BSD-3-Clause (selected) | Windows binary/installer | Use the BSD option and preserve its original notice; an unselected GPL alternative in source/legal files does not relicense the app. | CLEAR WITH NOTICE |
| libbzip2 | 1.0.8 | bzip2-1.0.6 | Windows binary/installer | Preserve the full Julian Seward custom permissive notice and original-source attribution. | CLEAR WITH NOTICE |
| ring / BoringSSL-derived crypto | 0.17.14 | Apache-2.0 AND ISC AND MIT | Windows binary/installer | Preserve all package and vendored-code license/notice texts. | CLEAR WITH NOTICE |
| Microsoft CRT/static runtime fragments | MSVC 14.44 toolchain / v143 native archive | Microsoft runtime/Visual Studio redistribution terms | Windows binary/installer | Preserve Microsoft notices and applicable runtime terms. No standalone Visual C++ redistributable installer or Windows/UCRT DLL is bundled. Producer/build-tool distribution rights remain governed by Visual Studio terms. | CLEAR WITH NOTICE |

## Native generation and exclusions

The wrapper and sys crate are both pinned to 2.0.1, with the matching sherpa-onnx-v2.0.1-win-x64-static-MT-Release-lib archive. Its SHA-256 is 23e7b986b197eda0bbc47ff3d7d5c87afd6ef2b9077214ba26b0f1ec52ef0e66. The bundled ONNX Runtime library is byte-identical to the independently verified 1.28.2 MT Release archive (archive SHA-256 77c6cc2a419828f450a570851d7d6d2385523c411dbe858f841a4c7338a78881).

The 11 sys-selected native libraries cover Sherpa C API/core, kaldi-decoder, kaldi-native-fbank, kaldifst, OpenFST/fstfar, KissFFT, ONNX Runtime, simple-sentencepiece and utf8proc. The separate C++ API archive is not selected by the sys build script. Shared template symbol names do not prove that extra archive was linked.

eSpeak NG, external piper-phonemize and the old eSpeak UCD tools are **not redistributed as runtime code**. They are not native license obligations of this new Windows generation. The old GPL chain was removed and is not solved by assigning it an Apache label. Sherpa's unshipped archive contains its own Apache-licensed Piper-model compatibility helpers; the final executable does not retain them. Sixteen textual piper occurrences are glyph names inside the unchanged embedded Nerd Font files, not speech-library code.

Windows/UCRT DLL imports are system dependencies, not bundled DLL files. MSVC CRT fragments statically included by the toolchain keep Microsoft's terms; no standalone VC redistributable installer is added. ONNX's complete ThirdPartyNotices is a broad upstream catalogue: optional GPU/MKL/vendor entries do not themselves prove redistribution of those optional runtimes in this CPU build. No CUDA/TensorRT runtime DLL is shipped.

## Original legal texts and source availability

Every component row points to its full original terms through THIRD_PARTY_LICENSES/components.json. The native/, fonts/, installers/ and webview2/ directories preserve original texts, including copyright and NOTICE material. The npm/ and cargo/ directories preserve the legal files of the locked dependency set. overrides.json identifies upstream legal texts when a published package omitted them. No generic license template with invented copyright is substituted.

The dependency inventory is deliberately broader than a binary inventory: build tools, type definitions, other-platform lock entries and normal dependency candidates are labeled. Available build-tool notices are preserved conservatively, but their inclusion here does not declare that the tools are distributed executable code. Production frontend modules are MIT/ISC/BSD/Apache or similarly permissive; DOMPurify's Apache-2.0 option is selected from MPL-2.0 OR Apache-2.0. Vite removes comments, so legal delivery relies on these installed files rather than minified comments.

The exact upstream source archives for both Eigen inputs and the MPL Rust helpers are in sources/. NSIS 3.11 retains its complete upstream root source/build/resource tree; only the redundant nested trunk mirror is omitted. WiX 3.14.1 is supplied as a source-only selection: the complete UI extension, dutil/wcautil libraries, shared source/resources and build tooling retain their original bytes and headers. Both selection manifests pin the full upstream archive and every retained file. Unrelated WiX redistributables, installer/certificate fixtures and compiled tools are omitted. The NSIS CPL LZMA linking exception and WiX MS-RL text are supplied in installers/. MPL/MS-RL file-level obligations and the CPL helper obligations do not relicense the separate AGPL application. The AGPL application has its own complete corresponding-source archive.

Third-party runtime GPL/LGPL code from the old eSpeak chain is absent. MPL remains for covered Eigen/Rust files; CPL with an explicit linking exception remains in NSIS's LZMA module; MS-RL remains in the WiX UI custom action. Fonts also carry OFL, CC-BY and Bitstream terms. Microsoft's WebView2 and CRT terms are proprietary/custom component terms, and bzip2 has its identified custom permissive notice. These known terms have concrete delivery actions; they are not classified UNKNOWN merely because they are reciprocal or custom.

## Font attribution

All four CaskaydiaCove Nerd Font Mono TTFs match the official Nerd Fonts 3.5.0 CascadiaCode distribution, based on Cascadia 2407.24. The base OFL text, original README, individual glyph notices, full CC-BY 4.0 text and complete Hack/Bitstream terms are in fonts/. Read fonts/ATTRIBUTION.md for the credited projects and the upstream merging/remapping/rehinting changes. The patched family already uses CaskaydiaCove to respect Cascadia Code's reserved font name. mosAIco did not modify those four files. Font/glyph software licensing does not grant trademark endorsement; project branding policy remains unchanged.

## Microsoft components and end-user terms

The NSIS/MSI license agreement page presents WINDOWS-TERMS.rtf, with the complete applicable Microsoft component terms and the required SmartScreen/update disclosures. The Microsoft WebView2/bootstrapper terms are separate from AGPL. WebView2 includes SmartScreen and can send information to Microsoft; see https://aka.ms/privacy and https://learn.microsoft.com/en-us/microsoft-edge/privacy-whitepaper#smartscreen . Update disclosures for Windows 7/8.1 remain in the full terms. Preserve these disclosures and require applicable component terms when redistributing; the original full Microsoft texts are also available after installation.

The Microsoft acquisition channel is the direct official bootstrapper URL used by Tauri, https://go.microsoft.com/fwlink/p/?LinkId=2124703. NSIS and MSI may use different valid Microsoft-signed bootstrapper builds because Tauri caches/downloads them independently; the legal validation does not pretend they have an identical version. The Windows release inspected here uses the component versions recorded in components.json.

## Reproduction and release enforcement

See THIRD_PARTY_LICENSES/README.md for commands and installed layout. Run npm ci, then node scripts/license-inventory.mjs to regenerate dependency evidence and materialize package legal texts. Two generations must be identical. node scripts/license-inventory.mjs --check verifies the full local Windows inventory offline. The --source-only variant validates versioned inputs and legal/source-file digests without npm/Rust caches or native compilation, and is used by normal CI.

The release workflow calls node scripts/license-distribution.mjs prepare before the supported Tauri release-profile build, and check --artifacts on the resulting NSIS and MSI before publication. A single checker validates the complete legal resource tree, the corresponding-source snapshot, target install paths and payload hashes in both packages. It extracts packages without running them. Missing, stale or changed mandatory files stop publication. No tag, release, source publication or repository visibility change is performed by this local task.

## Provenance limits and separate follow-up

provenance.json preserves upstream URLs/revisions and retrieved bytes' digests. Source/provenance evidence distinguishes a license text from a claim that every optional upstream component is present. The react-remove-scroll-bar 2.3.8 package omitted a legal file and has an unresolved published gitHead; all 12 distributed JavaScript files are byte-identical to the integrity-checked 2.3.7 package, and the publisher's pinned original MIT notice is preserved. Its version is not rewritten or silently downgraded.

The old package-manager-detector lock version contradicted its tarball/integrity. That inherited metadata-only field is corrected from 1.7.0 to the actually installed 1.6.0; code, URL and integrity are unchanged.

The existing Windows releaseScript.test.ts CRLF/shebang + Vite SSR loading failure is a separate baseline issue and remains unchanged. It does not establish a license problem or excuse a new test failure. No agent logo/trademark or macOS Ghostty binary approval is made by these Windows software notices.
