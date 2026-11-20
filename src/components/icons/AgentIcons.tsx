import {
  Bot,
  Braces,
  Code2,
  Keyboard,
  ListChecks,
  MessageSquare,
  MousePointer2,
  Rocket,
  Sparkles,
  Terminal,
} from 'lucide-react'

import { findAgentProvider } from '../../lib/agentProviders'
import type { AgentType, Theme } from '../../lib/types'

// Category symbols, not vendor marks. See docs/BRAND-ASSETS.md for provenance.
export function ShellIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11h5" strokeLinecap="round" />
    </svg>
  )
}

export function WslIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" />
      <path d="M5 6l2.5 2.5L5 11" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 11H11" strokeLinecap="round" />
    </svg>
  )
}

export function ClaudeIcon({ size = 16 }: { size?: number }) {
  return <MessageSquare size={size} aria-hidden="true" />
}

export function CodexIcon({ size = 16 }: { size?: number }) {
  return <Code2 size={size} aria-hidden="true" />
}

export function FreebuffIcon({ size = 16 }: { size?: number }) {
  return <Terminal size={size} aria-hidden="true" />
}

export function MimoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="2" y="2" width="12" height="12" rx="3" />
      <path d="M5 11V6l3 3 3-3v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function KiroIcon({ size = 16 }: { size?: number }) {
  return <ListChecks size={size} aria-hidden="true" />
}

export function OpenCodeIcon({ size = 16 }: { size?: number }) {
  return <Braces size={size} aria-hidden="true" />
}

export function CursorIcon({ size = 16 }: { size?: number }) {
  return <MousePointer2 size={size} aria-hidden="true" />
}

export function VSCodeIcon({ size = 14 }: { size?: number }) {
  return <Code2 size={size} aria-hidden="true" />
}

export function AntigravityIcon({ size = 16 }: { size?: number }) {
  return <Rocket size={size} aria-hidden="true" />
}

export function CopilotIcon({ size = 16 }: { size?: number }) {
  return <Bot size={size} aria-hidden="true" />
}

export function KimiIcon({ size = 16 }: { size?: number }) {
  return <Keyboard size={size} aria-hidden="true" />
}

export function AgentIcon({ type, size = 16 }: { type: AgentType; size?: number; theme: Theme }) {
  if (type === 'shell') return <ShellIcon size={size} />
  if (type === 'wsl') return <WslIcon size={size} />
  if (type === 'claude') return <ClaudeIcon size={size} />
  if (type === 'codex') return <CodexIcon size={size} />
  if (type === 'copilot') return <CopilotIcon size={size} />
  if (type === 'cursor') return <CursorIcon size={size} />
  if (type === 'freebuff') return <FreebuffIcon size={size} />
  if (type === 'mimo') return <MimoIcon size={size} />
  if (type === 'kiro') return <KiroIcon size={size} />
  if (type === 'kimi') return <KimiIcon size={size} />
  if (type === 'gemini') return <Sparkles size={size} aria-hidden="true" />
  if (type === 'antigravity') return <AntigravityIcon size={size} />
  if (type === 'opencode') return <OpenCodeIcon size={size} />
  const ProviderIcon = findAgentProvider(type)?.icon
  return ProviderIcon ? <ProviderIcon size={size} /> : <Bot size={size} />
}
