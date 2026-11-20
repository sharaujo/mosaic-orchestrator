# mosAIco 1.4.0 — validation and delivery
This release includes the 1.3.1 maintenance changes.

## Implemented

- New-file configuration export and handled save/import failures.
- Native audit report export; diagnostic operation context and common credential redaction.
- Main-webview dialog permissions and modal keyboard isolation for F3 / Ctrl+F.
- Consistent package, native application, installer and release-note versions.
- Separate account limits, in-app activity, detected history and estimated cost sections.
- Saved monthly subscription entries and manual USD/BRL exchange conversion with source and date.
- Deduplicated costs for identifiable workspace sessions; separate OpenCode global subtotal.
- Copilot CLI detection, account-page access, and guided agent terminal setup for sign-in.
- GitHub star link alongside sponsorship.

## Verification

- TypeScript and production frontend build passed.
- Rust export tests covered creating, reading and overwriting a file with spaces in its path,
  plus invalid paths and missing parent directories.
- Targeted frontend tests covered installer feedback, dialog capabilities, modal shortcuts,
  version alignment, Kanban, profile migration, session and orchestration behavior,
  locale registration, currency conversion, unavailable costs, session deduplication,
  subscription persistence, login navigation and diagnostic redaction.

## Practical limits

- The F3 safeguard is covered by keyboard-event tests. The reported native freeze was not
  reproduced in an installed WebView2 session, so this still requires a Windows smoke test.
- The Copilot card does not claim live quota or authentication. It detects the CLI and links to
  GitHub for account usage; plan and subscription entries are supplied by the user.
- Exchange rates are entered manually with their source and date, not fetched automatically.
- Transcript estimates are not invoices. A resumed session can contain external activity;
  missing or unpriced sessions are excluded and coverage is displayed.
- Native install/uninstall and live authentication flows require an interactive check on the
  user's machine. Existing running application processes were not restarted.

## Suggested Windows smoke test

1. Export a project to a new JSON file, then import it and verify its terminal configuration.
2. Open Synchronize your data, press F3, close the dialog and verify keyboard interaction.
3. Open AI usage details and check the four sections and Copilot card.
4. Enter a subscription and exchange metadata, reopen the app and confirm persistence.
5. Create/move a Kanban task and send it to an existing terminal.
6. Start a normal orchestration and verify the planner and workers appear together.
