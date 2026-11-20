import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_PROJECTS_FILE } from '../../lib/types'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import { UsageCosts } from './UsageCosts'
import { AgentLoginHelp } from './AgentLoginHelp'

vi.mock('../../lib/tauri', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/tauri')>(),
  getOpenCodeUsageSummary: vi.fn().mockRejectedValue(new Error('database unavailable')),
  getSessionCost: vi.fn().mockRejectedValue(new Error('session unavailable')),
}))

beforeEach(() => useProjectsStore.setState({ ...structuredClone(EMPTY_PROJECTS_FILE), hydrated: false }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('usage UI', () => {
  it('keeps unavailable costs unknown and persists entered subscriptions', async () => {
    render(<UsageCosts />)
    await waitFor(() => expect(screen.queryAllByText('Checking…')).toHaveLength(0))
    const row = screen.getByText('GitHub Copilot').closest('tr')!
    expect(within(row).getAllByText('Unavailable')).toHaveLength(2)
    fireEvent.change(within(row).getByRole('textbox'), { target: { value: 'My plan' } })
    expect(useProjectsStore.getState().preferences.usageCosts?.subscriptions.copilot.amount).toBeNull()
    fireEvent.change(within(row).getByRole('spinbutton'), { target: { value: '10' } })
    expect(useProjectsStore.getState().preferences.usageCosts?.subscriptions.copilot).toMatchObject({ amount: 10, currency: 'USD', plan: 'My plan' })
    expect(within(row).getByText('$10.00')).toBeInTheDocument()
  })

  it('keeps Antigravity quota separate from its unavailable session cost', async () => {
    render(<UsageCosts />)
    const row = screen.getByText('Antigravity').closest('tr')!
    expect(within(row).getByText('Antigravity session cost is unavailable.')).toBeInTheDocument()
    expect(within(row).getByText(/Account quota is separate from monetary cost/)).toBeInTheDocument()
    expect(within(row).queryByText('0 of 0 sessions with available cost')).not.toBeInTheDocument()
  })

  it('guides users without projects to create one', () => {
    render(<AgentLoginHelp />)
    fireEvent.click(screen.getByRole('button', { name: 'Create a project first' }))
    expect(useUiStore.getState().openModal).toBe('newProject')
  })

  it('opens the selected agent terminal configuration in the chosen project', () => {
    const project = useProjectsStore.getState().createProject({ name: 'Login test', defaultCwd: 'E:/test' })
    render(<AgentLoginHelp />)
    fireEvent.click(screen.getByRole('button', { name: 'Set up agent terminal' }))
    expect(useUiStore.getState().openModal).toBe('newTerminal')
    expect(useUiStore.getState().modalContext).toMatchObject({ projectId: project.id, only: ['antigravity'] })
  })
})
