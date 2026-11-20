# Security policy
## Supported versions

mosAIco does not currently publish a fixed version-support window. Security work is evaluated against
the current `main` branch and the latest published release. Before reporting, please check whether the
behavior still exists in one of those versions and include the exact version or commit you tested.
This wording is not a promise that every historical release will receive a fix.

## Report a vulnerability privately

**Do not open a public issue, discussion, or pull request for a suspected vulnerability.** Use the
[private vulnerability reporting page](https://github.com/SHARAUJO/mosaic-orchestrator/security/advisories/new)
when it is enabled. If it is unavailable, contact the maintainer through the contact method listed
on [their GitHub profile](https://github.com/sharaujo) without posting the vulnerability details publicly.

Include as much of the following as is safe to share:

- the affected mosAIco version or commit, operating system, and installation method;
- the affected feature and the security impact you believe is possible;
- prerequisites, a minimal reproduction, and whether the behavior works with default settings;
- relevant logs or screenshots after removing tokens, credentials, personal paths, repository
  contents, and other private data;
- any workaround you have tested; and
- how you would like to be credited, or that you prefer to remain anonymous.

Please use a concise proof of concept and do not access data or systems you do not own or have
permission to test. Do not send live credentials. If the initial report itself needs additional
protection, say so in the first email and coordinate a safer transfer method before sending sensitive
attachments.

The maintainers will assess the report and coordinate next steps when they can. This project does not
currently promise an acknowledgement, remediation, or disclosure deadline.

## Coordinated disclosure

Please keep the report private while it is being assessed and allow the maintainers a reasonable
opportunity to investigate and prepare a fix. Coordinate the timing and content of any public
disclosure before publishing details. The maintainers may ask for validation of a candidate fix and
will discuss credit with you. These expectations do not authorize testing against third-party systems
or other users.

## Scope and security boundaries

Reports about mosAIco's own code, packaging, update flow, local data handling, process execution,
embedded web content, or integrations are in scope. Problems that exist only in a coding-agent CLI,
MCP server, package manager, operating-system webview, or remote service should also be reported to
that upstream vendor; please still contact mosAIco privately if mosAIco's integration makes the impact
materially worse.

mosAIco is a terminal and coding-agent workspace. It intentionally starts subprocesses, gives terminal
sessions access to the selected working directory and inherited environment, and can connect to
services described in the [privacy and data-flow guide](docs/PRIVACY.md). A process doing what the
user explicitly asked is not by itself a vulnerability, but unintended privilege, origin, or data
exposure can be.

The production Tauri configuration has a restrictive Content Security Policy. It is defense in depth
for web content, not a containment boundary for privileged Tauri commands. Please do not rely on CSP
alone when evaluating command authorization or untrusted content.

## Bugs, questions, and feature requests

For crashes, setup help, ordinary bugs, documentation problems, and feature requests that do not
contain a security concern, use the public
[GitHub issue tracker](https://github.com/SHARAUJO/mosaic-orchestrator/issues). See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the requested reproduction and contribution details.
