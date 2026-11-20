# Platform readiness for mosAIco

This is a release gate, not a claim that installers for every operating system have been tested.
Builds and test results from one operating system do not establish runtime compatibility on the others.

| Platform | Planned bundle | Build environment | Current evidence |
| --- | --- | --- | --- |
| Windows x64 | NSIS `.exe` and MSI `.msi` | Windows with MSVC, Rust, Node.js and WebView2 | Local frontend build, tests, Rust check and NSIS bundle have succeeded. The orchestration board was exercised by the owner. |
| macOS Apple Silicon | app bundle and DMG | macOS runner, Xcode tools, Rust aarch64 target, pinned GhosttyKit | Release build temporarily disabled; no macOS build or native test has been completed. |
| macOS Intel | app bundle and DMG | macOS runner, Xcode tools, Rust x86_64 target, pinned GhosttyKit | Release build temporarily disabled; no macOS build or native test has been completed. |
| Linux x64 | deb and AppImage | Ubuntu 22.04 or another suitable WebKitGTK 4.1 build image, Rust and Node.js | Linux remains in source and Rust CI; binary distribution is paused while the GTK/WebKitGTK dependency chain is reviewed. |

## Work required before distributing macOS and Linux

1. Run the build and tests on each native operating system. Linux Rust CI prepares
   WebKitGTK and audio dependencies. Before re-enabling the macOS build, confirm the pinned
   GhosttyKit download is available and its checksum still matches.
2. Open the resulting app on both macOS architectures and on a supported Linux distribution.
   Test project creation, persistent PTYs and restart, Codex and Claude detection, orchestration
   delegation, Git operations, browser panes, notifications, clipboard, and audio permissions.
   Verify that the Codex MCP and hook shell bridges work with `sh` and `curl`.
3. Test Linux deb and AppImage separately. The AppImage baseline affects glibc compatibility;
   use an old enough build image for the distributions to be supported. Check GStreamer media
   handling for voice and browser audio inside the AppImage.
4. Configure an Apple Developer ID Application certificate and notarization credentials before
   offering a public DMG. An ad-hoc signed app is only suitable for development testing.
5. Updater artifact generation is currently disabled in the release-only Tauri config. Before
   offering automatic updates, configure artifact signing, a verified public key and endpoint,
   then test installation on each platform.
6. Review third-party binary redistribution requirements for GhosttyKit and the bundled speech
   libraries. Preserve upstream copyright and license notices.

The repository directory name does not determine the installed application name. The installed
product, bundle identifier, icons, command, and installer metadata use mosAIco. The source tree
retains copyright and historical references required to describe its upstream origin accurately.
