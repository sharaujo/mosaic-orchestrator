import { isWindows } from './platform'
import type { AgentType } from './types'

export type InstallToolchain = {
  node: string | null
  npm: boolean
  winget: boolean
  scoop: boolean
  choco: boolean
  bun: boolean
  pnpm: boolean
}

export type InstallMethodId = 'native' | 'npm' | 'winget' | 'scoop' | 'choco'

export type InstallMethod = {
  id: InstallMethodId
  command: string
  requires?: keyof InstallToolchain
  platform?: 'windows' | 'unix'
  /**
   * CLI to probe to decide whether the install worked. Defaults to the agent's own command; a
   * toolchain install (Node) has to be verified against the toolchain instead.
   */
  verifyCommand?: string
  /** Inverts the check: the run succeeded when the CLI is gone, not when it is found. */
  verifyAbsent?: boolean
}

export const NODE_DOWNLOAD_URL = 'https://nodejs.org/en/download'

export type AgentInstallCatalogEntry = {
  docsUrl: string
  methods: InstallMethod[]
}

const METHOD_ORDER: InstallMethodId[] = ['native', 'npm', 'winget', 'scoop', 'choco']

// Commands are fixed literals, never user input: they are handed straight to a
// shell PTY. Verified against each vendor's official install documentation.
export const AGENT_INSTALL_CATALOG: Partial<Record<AgentType, AgentInstallCatalogEntry>> = {
  claude: {
    docsUrl: 'https://code.claude.com/docs/en/setup',
    methods: [
      { id: 'native', command: 'irm https://claude.ai/install.ps1 | iex', platform: 'windows' },
      { id: 'native', command: 'curl -fsSL https://claude.ai/install.sh | bash', platform: 'unix' },
      {
        id: 'winget',
        command: 'winget install Anthropic.ClaudeCode',
        requires: 'winget',
        platform: 'windows',
      },
      { id: 'npm', command: 'npm install -g @anthropic-ai/claude-code', requires: 'npm' },
    ],
  },
  codex: {
    docsUrl: 'https://github.com/openai/codex',
    methods: [
      {
        id: 'native',
        command: 'irm https://chatgpt.com/codex/install.ps1 | iex',
        platform: 'windows',
      },
      { id: 'npm', command: 'npm install -g @openai/codex', requires: 'npm' },
    ],
  },
  copilot: {
    docsUrl: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-getting-started',
    methods: [
      {
        id: 'winget',
        command: 'winget install GitHub.Copilot',
        requires: 'winget',
        platform: 'windows',
      },
      { id: 'npm', command: 'npm install -g @github/copilot', requires: 'npm' },
    ],
  },
  cursor: {
    docsUrl: 'https://cursor.com/docs/cli/installation',
    methods: [
      {
        id: 'native',
        command: "irm 'https://cursor.com/install?win32=true' | iex",
        platform: 'windows',
      },
      { id: 'native', command: 'curl https://cursor.com/install -fsS | bash', platform: 'unix' },
    ],
  },
  antigravity: {
    docsUrl: 'https://antigravity.google/docs/cli/install',
    methods: [
      {
        id: 'native',
        command: 'irm https://antigravity.google/cli/install.ps1 | iex',
        platform: 'windows',
      },
      {
        id: 'native',
        command: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
        platform: 'unix',
      },
    ],
  },
  mimo: {
    docsUrl: 'https://github.com/XiaomiMiMo/MiMo-Code',
    methods: [
      {
        id: 'native',
        command: 'powershell -ep Bypass -c "irm https://mimo.xiaomi.com/install.ps1 | iex"',
        platform: 'windows',
      },
      {
        id: 'native',
        command: 'curl -fsSL https://mimo.xiaomi.com/install | bash',
        platform: 'unix',
      },
      { id: 'npm', command: 'npm install -g @mimo-ai/cli', requires: 'npm' },
    ],
  },
  freebuff: {
    docsUrl: 'https://freebuff.com',
    methods: [{ id: 'npm', command: 'npm install -g freebuff', requires: 'npm' }],
  },
  opencode: {
    docsUrl: 'https://opencode.ai/docs/',
    methods: [
      { id: 'npm', command: 'npm install -g opencode-ai', requires: 'npm' },
      { id: 'scoop', command: 'scoop install opencode', requires: 'scoop', platform: 'windows' },
      { id: 'choco', command: 'choco install opencode', requires: 'choco', platform: 'windows' },
    ],
  },
  kiro: {
    docsUrl: 'https://kiro.dev/cli/',
    methods: [
      {
        id: 'native',
        command: "irm 'https://cli.kiro.dev/install.ps1' | iex",
        platform: 'windows',
      },
      { id: 'native', command: 'curl -fsSL https://cli.kiro.dev/install | bash', platform: 'unix' },
    ],
  },
  kimi: {
    docsUrl: 'https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html',
    methods: [{ id: 'npm', command: 'npm install -g @moonshot-ai/kimi-code', requires: 'npm' }],
  },
  gemini: {
    docsUrl:
      'https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/installation.mdx',
    methods: [{ id: 'npm', command: 'npm install -g @google/gemini-cli', requires: 'npm' }],
  },
}

export function installDocsUrl(agent: AgentType): string | undefined {
  return AGENT_INSTALL_CATALOG[agent]?.docsUrl
}

/**
 * Methods that will actually work on this machine, best first. A method without
 * `requires` needs nothing beyond a shell, so it always qualifies.
 */
export function installMethodsFor(
  agent: AgentType,
  toolchain: InstallToolchain | null,
  windows = isWindows(),
): InstallMethod[] {
  const entry = AGENT_INSTALL_CATALOG[agent]
  if (!entry) return []
  return entry.methods
    .filter((method) => {
      if (method.platform && method.platform !== (windows ? 'windows' : 'unix')) return false
      if (!method.requires) return true
      if (!toolchain) return false
      return Boolean(toolchain[method.requires])
    })
    .sort((a, b) => METHOD_ORDER.indexOf(a.id) - METHOD_ORDER.indexOf(b.id))
}

// Official package identifiers for the Node.js LTS line, in the same order of preference used for
// agents: a real package manager first, and the download page as the always-available fallback.
const NODE_INSTALL_METHODS: InstallMethod[] = [
  {
    id: 'winget',
    command: 'winget install OpenJS.NodeJS.LTS',
    requires: 'winget',
    verifyCommand: 'npm',
  },
  { id: 'scoop', command: 'scoop install nodejs-lts', requires: 'scoop', verifyCommand: 'npm' },
  { id: 'choco', command: 'choco install nodejs-lts', requires: 'choco', verifyCommand: 'npm' },
]

/**
 * True when the agent would be installable here if Node were present: it has installers, but every
 * one of them needs npm and npm is missing. Agents with a native installer never qualify.
 */
export function needsNodeToolchain(
  agent: AgentType,
  toolchain: InstallToolchain | null,
  windows = isWindows(),
): boolean {
  const entry = AGENT_INSTALL_CATALOG[agent]
  if (!entry || entry.methods.length === 0) return false
  if (installMethodsFor(agent, toolchain, windows).length > 0) return false
  return entry.methods.some(
    (method) =>
      method.requires === 'npm' &&
      (!method.platform || method.platform === (windows ? 'windows' : 'unix')),
  )
}

/** Node installers that work on this machine, best first. Empty means "send them to the website". */
export function nodeInstallMethods(
  toolchain: InstallToolchain | null,
  windows = isWindows(),
): InstallMethod[] {
  if (!toolchain || !windows) return []
  return NODE_INSTALL_METHODS.filter((method) =>
    method.requires ? Boolean(toolchain[method.requires]) : true,
  )
}

// Every documented install command ends in the package or package id, so the uninstall counterpart
// is derived from it rather than duplicated in the catalog.
const UNINSTALL_TEMPLATE: Partial<Record<InstallMethodId, (target: string) => string>> = {
  npm: (target) => `npm uninstall -g ${target}`,
  winget: (target) => `winget uninstall ${target}`,
  scoop: (target) => `scoop uninstall ${target}`,
  choco: (target) => `choco uninstall ${target} -y`,
}

/**
 * How this agent can be removed on this machine, best first. `native` installers are skipped: none
 * of the vendors documents an uninstall for their install script, and guessing would delete the
 * wrong thing. An empty list means "we cannot remove it for you".
 */
export function uninstallMethodsFor(
  agent: AgentType,
  toolchain: InstallToolchain | null,
  windows = isWindows(),
): InstallMethod[] {
  return installMethodsFor(agent, toolchain, windows).flatMap((method) => {
    const template = UNINSTALL_TEMPLATE[method.id]
    if (!template) return []
    const target = method.command.trim().split(/\s+/).pop()
    if (!target) return []
    return [{ ...method, command: template(target), verifyAbsent: true }]
  })
}

/** Line handed to the shell PTY: run the installer and preserve its exit status. */
export function installShellLine(command: string, windows = isWindows()): string {
  if (!windows) return `${command}; __mosaico_exit=$?; exit "$__mosaico_exit"\r`
  return `${command}; $__mosaico_ok = $?; $__mosaico_exit = $LASTEXITCODE; if ($__mosaico_exit -is [int] -and $__mosaico_exit -ne 0) { exit $__mosaico_exit }; if (-not $__mosaico_ok) { exit 1 }; exit 0\r`
}

const ANSI_PATTERN =
  /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|[\x00-\x08\x0b\x0c\x0e-\x1f]/g

/** Installer output is raw PTY bytes; strip the escape sequences before rendering it as text. */
export function stripInstallLogAnsi(log: string): string {
  return log.replace(ANSI_PATTERN, '')
}
