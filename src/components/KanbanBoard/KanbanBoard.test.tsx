import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PluginStorage } from '../../lib/plugins'
import { ptyExists, writePty } from '../../lib/tauri'
import { EMPTY_PROJECTS_FILE } from '../../lib/types'
import { hydrateTodos, resetTodosStoreForTests, useTodosStore } from '../../plugins/todos/store'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import { KanbanBoard } from './index'

vi.mock('../../lib/tauri', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/tauri')>(),
  ptyExists: vi.fn().mockResolvedValue(true),
  writePty: vi.fn().mockResolvedValue(undefined),
}))

function storage(): PluginStorage {
  let record: Record<string, unknown> = {}
  return {
    read: async () => record,
    get: async (key, fallback) => (record[key] ?? fallback) as never,
    set: async (key, value) => { record = { ...record, [key]: value } },
    remove: async (key) => { const { [key]: _removed, ...rest } = record; record = rest },
    clear: async () => { record = {} },
  }
}

beforeEach(async () => {
  useProjectsStore.setState({ ...structuredClone(EMPTY_PROJECTS_FILE), hydrated: false })
  useUiStore.getState().setActiveView('workspace')
  resetTodosStoreForTests()
  await hydrateTodos(storage(), { todos: [], storagePath: '' })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(document, 'elementFromPoint')
  vi.clearAllMocks()
})

describe('Kanban board', () => {
  it('creates a project task and shows it in the pending column', () => {
    const project = useProjectsStore.getState().createProject({ name: 'Website', defaultCwd: 'C:/website' })
    render(<KanbanBoard />)
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Build homepage' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Create hero and navigation' } })
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Project'), { target: { value: project.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Build homepage')).toBeInTheDocument()
    expect(useTodosStore.getState().todos[0]).toMatchObject({
      projectId: project.id,
      columnId: 'pending',
      description: 'Create hero and navigation',
    })
  })

  it('moves a task when dropped into another column', () => {
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent })
    const task = useTodosStore.getState().createBoardTask('Review design', '', undefined)!
    render(<KanbanBoard />)
    const card = screen.getByText('Review design').closest('[role="button"]')!
    const target = screen.getByText('In progress').closest('section')!
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn().mockReturnValue(target) })
    fireEvent.pointerDown(card, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 100, clientY: 20 })
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 100, clientY: 20 })
    expect(document.elementFromPoint).toHaveBeenCalled()
    expect(useTodosStore.getState().todos.find((item) => item.id === task.id)?.columnId).toBe('inProgress')
    expect(within(target).getByText('Review design')).toBeInTheDocument()
  })

  it('sends a card to a running agent terminal selected from its context menu', async () => {
    const project = useProjectsStore.getState().createProject({ name: 'Website', defaultCwd: 'C:/website' })
    const terminal = useProjectsStore.getState().createTerminal(project.id, {
      name: 'Codex 1', cwd: 'C:/website', firstTab: { type: 'codex', cwd: 'C:/website' },
    })
    useProjectsStore.setState((state) => ({
      projects: state.projects.map((item) => item.id === project.id
        ? { ...item, terminals: item.terminals.map((entry) => entry.id === terminal.id
          ? { ...entry, tabs: entry.tabs.map((tab) => ({ ...tab, ptyId: 'pty-live' })) }
          : entry) }
        : item),
    }))
    const task = useTodosStore.getState().createBoardTask('Build homepage', 'Create hero', project.id)!
    render(<KanbanBoard />)
    fireEvent.contextMenu(screen.getByText('Build homepage').closest('[role="button"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Codex 1' }))
    await waitFor(() => expect(writePty).toHaveBeenCalledWith('pty-live', '\x1b[200~Build homepage\n\nCreate hero\x1b[201~'))
    expect(ptyExists).toHaveBeenCalledWith('pty-live')
    expect(writePty).toHaveBeenCalledWith('pty-live', '\r')
    expect(useTodosStore.getState().todos.find((item) => item.id === task.id)?.sentToTerminal).toBe('Website / Codex 1')
    expect(useUiStore.getState().activeView).toBe('workspace')
  })

  it('queues a task for an existing terminal that has not started', async () => {
    const project = useProjectsStore.getState().createProject({ name: 'Website', defaultCwd: 'C:/website' })
    const terminal = useProjectsStore.getState().createTerminal(project.id, {
      name: 'Codex 1', cwd: 'C:/website', firstTab: { type: 'codex', cwd: 'C:/website' },
    })
    useTodosStore.getState().createBoardTask('Review homepage', 'Check layout', project.id)
    render(<KanbanBoard />)
    fireEvent.contextMenu(screen.getByText('Review homepage').closest('[role="button"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Codex 1' }))
    await waitFor(() => expect(useUiStore.getState().activeView).toBe('workspace'))
    const tab = useProjectsStore.getState().projects.find((item) => item.id === project.id)!
      .terminals.find((item) => item.id === terminal.id)!.tabs[0]
    expect(tab.initialInput).toBe('Review homepage\n\nCheck layout')
    expect(tab.ptyId).toBeNull()
  })

  it('opens a new Codex terminal with the task prompt', () => {
    const project = useProjectsStore.getState().createProject({ name: 'Website', defaultCwd: 'C:/website' })
    useTodosStore.getState().createBoardTask('Build homepage', '', project.id)
    render(<KanbanBoard />)
    fireEvent.contextMenu(screen.getByText('Build homepage').closest('[role="button"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'New Codex terminal' }))
    const terminal = useProjectsStore.getState().projects.find((item) => item.id === project.id)!.terminals[0]
    expect(terminal.tabs[0]).toMatchObject({ type: 'codex', cwd: 'C:/website', initialInput: 'Build homepage' })
    expect(useUiStore.getState().activeView).toBe('workspace')
  })
})
