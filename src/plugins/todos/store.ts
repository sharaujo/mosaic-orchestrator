import { nanoid } from 'nanoid'
import { create } from 'zustand'

import type { PluginStorage } from '../../lib/plugins'
import { DEFAULT_TODOS, normalizeTodoTags, normalizeTodoTitle, reorderTodoItems } from '../../lib/todos'
import type { TodoItem } from '../../lib/types'

const TODOS_KEY = 'todos'
const STORAGE_PATH_KEY = 'storagePath'
const COLUMNS_KEY = 'kanbanColumns'

export type KanbanColumn = { id: string; title: string }

export const DEFAULT_KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'pending', title: 'Pending' },
  { id: 'inProgress', title: 'In Progress' },
  { id: 'testing', title: 'In Testing' },
  { id: 'completed', title: 'Completed' },
]

export function todoColumn(todo: TodoItem, columns: KanbanColumn[]): string {
  if (todo.columnId && columns.some((column) => column.id === todo.columnId)) return todo.columnId
  return todo.completed ? 'completed' : 'pending'
}

type TodosState = {
  todos: TodoItem[]
  kanbanColumns: KanbanColumn[]
  storagePath: string
  hydrated: boolean
  createTodo: (title: string, tags?: string[], projectId?: string) => TodoItem | null
  createBoardTask: (title: string, description: string, projectId?: string, columnId?: string) => TodoItem | null
  updateBoardTask: (id: string, title: string, description: string, projectId?: string) => void
  moveBoardTask: (id: string, columnId: string, beforeId?: string) => void
  markTaskSent: (id: string, terminalName: string) => void
  addKanbanColumn: (title: string) => void
  renameKanbanColumn: (id: string, title: string) => void
  removeKanbanColumn: (id: string) => void
  createTodoFromPullRequest: (
    pr: { number: number; title: string; url: string; repo: string },
    projectId?: string,
  ) => TodoItem
  renameTodo: (id: string, title: string) => void
  updateTodoTags: (id: string, tags: string[]) => void
  setTodoProject: (id: string, projectId: string | null | undefined) => void
  toggleTodo: (id: string) => void
  deleteTodo: (id: string) => void
  reorderTodo: (draggedId: string, targetId: string) => void
  resetTodosToDefault: () => void
  setStoragePath: (path: string) => void
}

let storage: PluginStorage | null = null

function persistTodos(todos: TodoItem[]) {
  void storage?.set(TODOS_KEY, todos)
}

function persistColumns(columns: KanbanColumn[]) {
  void storage?.set(COLUMNS_KEY, columns)
}

export const useTodosStore = create<TodosState>((set, get) => {
  const write = (todos: TodoItem[]) => {
    persistTodos(todos)
    set({ todos })
  }

  return {
    todos: [],
    kanbanColumns: DEFAULT_KANBAN_COLUMNS,
    storagePath: '',
    hydrated: false,

    createTodo: (rawTitle, rawTags = [], projectId) => {
      const title = normalizeTodoTitle(rawTitle)
      if (!title) return null
      const todo: TodoItem = {
        id: nanoid(),
        title,
        completed: false,
        tags: normalizeTodoTags(rawTags),
        ...(projectId ? { projectId } : {}),
      }
      const todos = get().todos
      const completedIndex = todos.findIndex((item) => item.completed)
      const insertAt = completedIndex === -1 ? todos.length : completedIndex
      write([...todos.slice(0, insertAt), todo, ...todos.slice(insertAt)])
      return todo
    },

    createBoardTask: (rawTitle, rawDescription, projectId, requestedColumnId = 'pending') => {
      const title = normalizeTodoTitle(rawTitle)
      if (!title) return null
      const columnId = get().kanbanColumns.some((column) => column.id === requestedColumnId)
        ? requestedColumnId
        : 'pending'
      const todo: TodoItem = {
        id: nanoid(), title, description: rawDescription.trim().slice(0, 4000),
        completed: columnId === 'completed', columnId, createdAt: Date.now(), tags: [],
        ...(projectId ? { projectId } : {}),
      }
      write([...get().todos, todo])
      return todo
    },

    updateBoardTask: (id, rawTitle, rawDescription, projectId) => {
      const title = normalizeTodoTitle(rawTitle)
      if (!title) return
      write(get().todos.map((item) => item.id === id
        ? { ...item, title, description: rawDescription.trim().slice(0, 4000), projectId: projectId || undefined }
        : item))
    },

    moveBoardTask: (id, columnId, beforeId) => {
      if (id === beforeId) return
      const state = get()
      if (!state.kanbanColumns.some((column) => column.id === columnId)) return
      const current = state.todos.find((item) => item.id === id)
      if (!current) return
      const remaining = state.todos.filter((item) => item.id !== id)
      const beforeIndex = beforeId && beforeId !== id
        ? remaining.findIndex((item) => item.id === beforeId && todoColumn(item, state.kanbanColumns) === columnId)
        : -1
      const lastIndex = remaining.reduce((last, item, index) =>
        todoColumn(item, state.kanbanColumns) === columnId ? index : last, -1)
      const insertAt = beforeIndex >= 0 ? beforeIndex : lastIndex + 1 || remaining.length
      const next = [...remaining]
      next.splice(insertAt, 0, { ...current, columnId, completed: columnId === 'completed' })
      write(next)
    },

    markTaskSent: (id, terminalName) => write(get().todos.map((item) => item.id === id
      ? { ...item, sentToTerminal: terminalName }
      : item)),

    addKanbanColumn: (rawTitle) => {
      const title = rawTitle.trim().slice(0, 48)
      if (!title || get().kanbanColumns.some((column) => column.title.toLowerCase() === title.toLowerCase())) return
      const columns = [...get().kanbanColumns, { id: nanoid(), title }]
      persistColumns(columns)
      set({ kanbanColumns: columns })
    },

    renameKanbanColumn: (id, rawTitle) => {
      const title = rawTitle.trim().slice(0, 48)
      if (!title || DEFAULT_KANBAN_COLUMNS.some((column) => column.id === id)) return
      const columns = get().kanbanColumns.map((column) => column.id === id ? { ...column, title } : column)
      persistColumns(columns)
      set({ kanbanColumns: columns })
    },

    removeKanbanColumn: (id) => {
      if (DEFAULT_KANBAN_COLUMNS.some((column) => column.id === id)) return
      if (get().todos.some((item) => todoColumn(item, get().kanbanColumns) === id)) return
      const columns = get().kanbanColumns.filter((column) => column.id !== id)
      persistColumns(columns)
      set({ kanbanColumns: columns })
    },

    createTodoFromPullRequest: (pr, projectId) => {
      const existing = get().todos.find(
        (item) => item.prRepo === pr.repo && item.prNumber === pr.number,
      )
      if (existing) return existing
      const todo: TodoItem = {
        id: nanoid(),
        title: normalizeTodoTitle(`PR #${pr.number}: ${pr.title}`),
        completed: false,
        tags: ['pr'],
        ...(projectId ? { projectId } : {}),
        prUrl: pr.url,
        prNumber: pr.number,
        prRepo: pr.repo,
      }
      const todos = get().todos
      const completedIndex = todos.findIndex((item) => item.completed)
      const insertAt = completedIndex === -1 ? todos.length : completedIndex
      write([...todos.slice(0, insertAt), todo, ...todos.slice(insertAt)])
      return todo
    },

    renameTodo: (id, rawTitle) => {
      const title = normalizeTodoTitle(rawTitle)
      if (!title) return
      write(get().todos.map((item) => (item.id === id ? { ...item, title } : item)))
    },

    updateTodoTags: (id, tags) =>
      write(
        get().todos.map((item) =>
          item.id === id ? { ...item, tags: normalizeTodoTags(tags) } : item,
        ),
      ),

    setTodoProject: (id, projectId) =>
      write(
        get().todos.map((item) => {
          if (item.id !== id) return item
          const next = { ...item }
          if (projectId) next.projectId = projectId
          else delete next.projectId
          return next
        }),
      ),

    toggleTodo: (id) => {
      const todos = get().todos
      const current = todos.find((item) => item.id === id)
      if (!current) return
      const changed = { ...current, completed: !current.completed, columnId: current.completed ? 'pending' : 'completed' }
      const remaining = todos.filter((item) => item.id !== id)
      if (changed.completed) {
        write([...remaining, changed])
        return
      }
      const completedIndex = remaining.findIndex((item) => item.completed)
      const insertAt = completedIndex === -1 ? remaining.length : completedIndex
      write([...remaining.slice(0, insertAt), changed, ...remaining.slice(insertAt)])
    },

    deleteTodo: (id) => write(get().todos.filter((item) => item.id !== id)),

    reorderTodo: (draggedId, targetId) =>
      write(reorderTodoItems(get().todos, draggedId, targetId)),

    resetTodosToDefault: () =>
      write(DEFAULT_TODOS.map((item) => ({ ...item, id: nanoid() }))),

    setStoragePath: (path) => {
      void storage?.set(STORAGE_PATH_KEY, path)
      set({ storagePath: path })
    },
  }
})

/**
 * Loads the plugin's own record, falling back to whatever the pre-plugin core
 * had stored. The legacy values are copied, never cleared: if this plugin is
 * removed the user's list is still in `projects.json`.
 */
export async function hydrateTodos(
  pluginStorage: PluginStorage,
  legacy: { todos: TodoItem[]; storagePath: string },
): Promise<void> {
  storage = pluginStorage
  const record = await pluginStorage.read()

  const stored = Array.isArray(record[TODOS_KEY]) ? (record[TODOS_KEY] as TodoItem[]) : null
  const storedColumns = Array.isArray(record[COLUMNS_KEY]) ? record[COLUMNS_KEY] as KanbanColumn[] : []
  const customColumns = storedColumns.filter((column) =>
    column && typeof column.id === 'string' && typeof column.title === 'string' &&
    column.title.trim() && !DEFAULT_KANBAN_COLUMNS.some((entry) => entry.id === column.id),
  )
  const kanbanColumns = [...DEFAULT_KANBAN_COLUMNS, ...customColumns]
  const todos = stored ?? legacy.todos
  const storagePath =
    typeof record[STORAGE_PATH_KEY] === 'string'
      ? (record[STORAGE_PATH_KEY] as string)
      : legacy.storagePath

  useTodosStore.setState({ todos, kanbanColumns, storagePath, hydrated: true })

  if (!stored && legacy.todos.length > 0) await pluginStorage.set(TODOS_KEY, legacy.todos)
  if (record[STORAGE_PATH_KEY] === undefined && legacy.storagePath) {
    await pluginStorage.set(STORAGE_PATH_KEY, legacy.storagePath)
  }
}

export function resetTodosStoreForTests(): void {
  storage = null
  useTodosStore.setState({ todos: [], kanbanColumns: DEFAULT_KANBAN_COLUMNS, storagePath: '', hydrated: false })
}
