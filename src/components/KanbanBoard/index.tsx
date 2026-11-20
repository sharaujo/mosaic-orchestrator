import {
  Check, ChevronRight, CircleCheck, Clock3, Columns3, FlaskConical, Folder,
  Pencil, Play, Plus, Search, Send, SquareTerminal, Trash2, X,
} from 'lucide-react'
import { type FormEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'

import { getLocale, translate, useT } from '../../lib/i18n'
import { activateForView } from '../../lib/plugins'
import { ptyExists, writePty } from '../../lib/tauri'
import type { Project, TodoItem } from '../../lib/types'
import { DEFAULT_KANBAN_COLUMNS, todoColumn, useTodosStore } from '../../plugins/todos/store'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUiStore } from '../../stores/uiStore'
import styles from './KanbanBoard.module.css'

type EditorState = { id?: string; columnId: string; title: string; description: string; projectId: string }
type ContextState = { taskId: string; x: number; y: number; projectId: string | null }

const COLUMN_ICONS = { pending: Clock3, inProgress: Play, testing: FlaskConical, completed: CircleCheck }

function taskPrompt(task: TodoItem): string {
  return [task.title, task.description?.trim()].filter(Boolean).join('\n\n').slice(0, 4000)
}

export function KanbanBoard() {
  const t = useT()
  const projects = useProjectsStore((state) => state.projects)
  const setActiveProject = useProjectsStore((state) => state.setActiveProject)
  const setFullscreenPane = useProjectsStore((state) => state.setFullscreenPane)
  const createTerminal = useProjectsStore((state) => state.createTerminal)
  const setSubTabPtyId = useProjectsStore((state) => state.setSubTabPtyId)
  const setSubTabInitialInput = useProjectsStore((state) => state.setSubTabInitialInput)
  const openModal = useUiStore((state) => state.openModal_)
  const setActiveView = useUiStore((state) => state.setActiveView)
  const setActiveTerminal = useUiStore((state) => state.setActiveTerminal)
  const requestPaneFocus = useUiStore((state) => state.requestPaneFocus)
  const todos = useTodosStore((state) => state.todos)
  const columns = useTodosStore((state) => state.kanbanColumns)
  const hydrated = useTodosStore((state) => state.hydrated)
  const createTask = useTodosStore((state) => state.createBoardTask)
  const updateTask = useTodosStore((state) => state.updateBoardTask)
  const moveTask = useTodosStore((state) => state.moveBoardTask)
  const deleteTask = useTodosStore((state) => state.deleteTodo)
  const markSent = useTodosStore((state) => state.markTaskSent)
  const setTodoProject = useTodosStore((state) => state.setTodoProject)
  const addColumn = useTodosStore((state) => state.addKanbanColumn)
  const renameColumn = useTodosStore((state) => state.renameKanbanColumn)
  const removeColumn = useTodosStore((state) => state.removeKanbanColumn)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [context, setContext] = useState<ContextState | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [columnDraft, setColumnDraft] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const pointerDrag = useRef<{ id: string; x: number; y: number; dragging: boolean } | null>(null)
  const suppressCardClick = useRef(false)

  useEffect(() => {
    void activateForView('todos')
      .then(() => {
        if (!useTodosStore.getState().hydrated) setError(translate(getLocale(), 'kanban.loadFailed'))
      })
      .catch(() => setError(translate(getLocale(), 'kanban.loadFailed')))
  }, [])

  useEffect(() => {
    if (!context) return
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setContext(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContext(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', escape)
    }
  }, [context])

  const visible = useMemo(() => todos.filter((todo) => {
    if (projectFilter !== 'all' && todo.projectId !== projectFilter) return false
    const query = search.trim().toLocaleLowerCase()
    return !query || `${todo.title} ${todo.description ?? ''}`.toLocaleLowerCase().includes(query)
  }), [todos, projectFilter, search])

  const showEditor = (columnId = 'pending', task?: TodoItem) => {
    setError('')
    setContext(null)
    setEditor({
      id: task?.id,
      columnId: task ? todoColumn(task, columns) : columnId,
      title: task?.title ?? '',
      description: task?.description ?? '',
      projectId: task?.projectId ?? (projectFilter === 'all' ? '' : projectFilter),
    })
  }

  const saveEditor = (event: FormEvent) => {
    event.preventDefault()
    if (!editor?.title.trim()) return
    if (editor.id) {
      updateTask(editor.id, editor.title, editor.description, editor.projectId)
      const current = todos.find((task) => task.id === editor.id)
      if (current && todoColumn(current, columns) !== editor.columnId) moveTask(editor.id, editor.columnId)
    } else createTask(editor.title, editor.description, editor.projectId || undefined, editor.columnId)
    setEditor(null)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
    pointerDrag.current = { id, x: event.clientX, y: event.clientY, dragging: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = pointerDrag.current
    if (!drag) return
    if (!drag.dragging && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return
    if (!drag.dragging) {
      drag.dragging = true
      setDraggedId(drag.id)
      setContext(null)
    }
    event.preventDefault()
    const column = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-kanban-column]')
    setDragOver(column?.dataset.kanbanColumn ?? null)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = pointerDrag.current
    pointerDrag.current = null
    if (drag?.dragging) {
      const hit = document.elementFromPoint(event.clientX, event.clientY)
      const columnId = hit?.closest<HTMLElement>('[data-kanban-column]')?.dataset.kanbanColumn
      const beforeId = hit?.closest<HTMLElement>('[data-kanban-card]')?.dataset.kanbanCard
      if (columnId) moveTask(drag.id, columnId, beforeId)
      suppressCardClick.current = true
      window.setTimeout(() => { suppressCardClick.current = false }, 0)
    }
    setDraggedId(null)
    setDragOver(null)
  }

  const openContext = (event: MouseEvent, task: TodoItem) => {
    event.preventDefault()
    setContext({
      taskId: task.id,
      x: Math.min(event.clientX, window.innerWidth - 310),
      y: Math.min(event.clientY, window.innerHeight - 360),
      projectId: task.projectId ?? null,
    })
    setError('')
  }

  const sendToExisting = async (task: TodoItem, project: Project, terminalId: string) => {
    const terminal = project.terminals.find((item) => item.id === terminalId)
    const tab = terminal?.tabs.find((item) => item.id === terminal.activeTabId)
    if (!terminal || !tab || terminal.disabled) {
      setError(t('kanban.terminalUnavailable'))
      return
    }
    try {
      const prompt = taskPrompt(task)
      const live = tab.ptyId && await ptyExists(tab.ptyId).catch(() => false)
      if (live && tab.ptyId) {
        await writePty(tab.ptyId, `\x1b[200~${prompt}\x1b[201~`)
        await writePty(tab.ptyId, '\r')
        markSent(task.id, `${project.name} / ${terminal.name}`)
      } else {
        setSubTabPtyId(project.id, terminal.id, tab.id, null)
        setSubTabInitialInput(project.id, terminal.id, tab.id, prompt)
      }
      setTodoProject(task.id, project.id)
      setActiveProject(project.id)
      setActiveTerminal(project.id, terminal.id)
      setFullscreenPane(terminal.id)
      requestPaneFocus(terminal.id)
      setActiveView('workspace')
      setContext(null)
    } catch {
      setError(t('kanban.sendFailed'))
    }
  }

  const sendToNew = (task: TodoItem, project: Project) => {
    const cwd = project.defaultCwd || project.terminals.find((terminal) => terminal.cwd)?.cwd || ''
    if (!cwd) {
      setError(t('kanban.projectFolderRequired'))
      return
    }
    const terminal = createTerminal(project.id, {
      name: task.title.slice(0, 48),
      cwd,
      firstTab: { type: 'codex', cwd, initialInput: taskPrompt(task) },
    })
    setTodoProject(task.id, project.id)
    markSent(task.id, `${project.name} / ${terminal.name}`)
    setActiveProject(project.id)
    setActiveTerminal(project.id, terminal.id)
    setFullscreenPane(terminal.id)
    requestPaneFocus(terminal.id)
    setActiveView('workspace')
    setContext(null)
  }

  const contextTask = context ? todos.find((todo) => todo.id === context.taskId) : null
  const contextProject = projects.find((project) => project.id === context?.projectId)
  const customColumn = (id: string) => !DEFAULT_KANBAN_COLUMNS.some((column) => column.id === id)

  return (
    <div className={styles.board}>
      <header className={styles.toolbar}>
        <div className={styles.brand}><Columns3 size={18} /><strong>{t('kanban.title')}</strong></div>
        <label className={styles.search}><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('kanban.search')} aria-label={t('kanban.search')} /></label>
        <label className={styles.filter}><Folder size={15} /><select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label={t('kanban.projectFilter')}><option value="all">{t('kanban.allProjects')}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <button className={styles.secondary} type="button" onClick={() => openModal('newProject')}>{t('kanban.createProject')}</button>
        <button className={styles.primary} type="button" onClick={() => showEditor()}><Plus size={15} />{t('kanban.addTask')}</button>
      </header>

      {error ? <div role="alert" className={styles.error}>{error}<button type="button" onClick={() => setError('')} aria-label={t('common.close')}><X size={14} /></button></div> : null}
      {!hydrated ? <div className={styles.loading}>{t('kanban.loading')}</div> : (
        <div className={styles.scroller}>
          <div className={styles.columns}>
            {columns.map((column) => {
              const items = visible.filter((todo) => todoColumn(todo, columns) === column.id)
              const Icon = COLUMN_ICONS[column.id as keyof typeof COLUMN_ICONS] ?? Columns3
              return <section
                key={column.id}
                data-kanban-column={column.id}
                className={`${styles.column} ${styles[`column_${column.id}`] ?? ''} ${dragOver === column.id ? styles.columnDrop : ''}`}
              >
                <div className={styles.columnHeader}>
                  <Icon size={16} /><span className={styles.columnTitle}>{customColumn(column.id) ? column.title : t(`kanban.column.${column.id}` as Parameters<typeof t>[0])}</span><span className={styles.count}>{items.length}</span>
                  <button type="button" className={styles.iconButton} onClick={() => showEditor(column.id)} aria-label={t('kanban.addToColumn', { column: column.title })}><Plus size={15} /></button>
                  {customColumn(column.id) ? <button type="button" className={styles.iconButton} onClick={() => { const title = window.prompt(t('kanban.renameColumn'), column.title); if (title !== null) renameColumn(column.id, title) }} aria-label={t('kanban.renameColumn')}><Pencil size={13} /></button> : null}
                  {customColumn(column.id) && !todos.some((todo) => todoColumn(todo, columns) === column.id) ? <button type="button" className={styles.iconButton} onClick={() => removeColumn(column.id)} aria-label={t('kanban.removeColumn')}><Trash2 size={13} /></button> : null}
                </div>
                <div className={styles.cards}>
                  {items.length === 0 ? <div className={styles.empty}>{t('kanban.emptyColumn')}</div> : null}
                  {items.map((task) => <article
                    key={task.id}
                    data-kanban-card={task.id}
                    className={`${styles.card} ${draggedId === task.id ? styles.dragging : ''}`}
                    onPointerDown={(event) => onPointerDown(event, task.id)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => { pointerDrag.current = null; setDraggedId(null); setDragOver(null) }}
                    onContextMenu={(event) => openContext(event, task)}
                    onClick={() => { if (!suppressCardClick.current) showEditor(column.id, task) }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => { if (event.key === 'Enter') showEditor(column.id, task) }}
                  >
                    <div className={styles.cardMeta}><span className={styles.projectTag}>{projects.find((project) => project.id === task.projectId)?.name ?? t('kanban.noProject')}</span></div>
                    <strong>{task.title}</strong>
                    {task.description ? <p>{task.description}</p> : null}
                    <div className={styles.cardFooter}><span>{task.createdAt ? new Date(task.createdAt).toLocaleDateString() : ''}</span><button type="button" onClick={(event) => { event.stopPropagation(); openContext(event, task) }} aria-label={t('kanban.sendToTerminal')} title={t('kanban.sendToTerminal')}><Send size={14} /></button></div>
                    {task.sentToTerminal ? <div className={styles.sent}><Check size={12} />{task.sentToTerminal}</div> : null}
                  </article>)}
                </div>
              </section>
            })}
            <div className={styles.addColumn}>
              {addingColumn ? <form onSubmit={(event) => { event.preventDefault(); addColumn(columnDraft); setColumnDraft(''); setAddingColumn(false) }}><input autoFocus value={columnDraft} onChange={(event) => setColumnDraft(event.target.value)} maxLength={48} placeholder={t('kanban.columnName')} aria-label={t('kanban.columnName')} /><button type="submit" disabled={!columnDraft.trim()}>{t('common.create')}</button><button type="button" onClick={() => setAddingColumn(false)} aria-label={t('common.cancel')}><X size={15} /></button></form> : <button type="button" onClick={() => setAddingColumn(true)}><Plus size={16} />{t('kanban.addColumn')}</button>}
            </div>
          </div>
        </div>
      )}

      {editor ? <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={editor.id ? t('kanban.editTask') : t('kanban.addTask')} onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null) }}><form className={styles.editor} onSubmit={saveEditor}>
        <div className={styles.editorHeader}><h2>{editor.id ? t('kanban.editTask') : t('kanban.addTask')}</h2><button type="button" onClick={() => setEditor(null)} aria-label={t('common.close')}><X size={18} /></button></div>
        <label>{t('kanban.taskTitle')}<input autoFocus required maxLength={200} value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} /></label>
        <label>{t('kanban.description')}<textarea rows={5} maxLength={4000} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label>
        <label>{t('kanban.projectFilter')}<select value={editor.projectId} onChange={(event) => setEditor({ ...editor, projectId: event.target.value })}><option value="">{t('kanban.noProject')}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label>{t('kanban.columnLabel')}<select value={editor.columnId} onChange={(event) => setEditor({ ...editor, columnId: event.target.value })}>{columns.map((column) => <option key={column.id} value={column.id}>{DEFAULT_KANBAN_COLUMNS.some((entry) => entry.id === column.id) ? t(`kanban.column.${column.id}` as Parameters<typeof t>[0]) : column.title}</option>)}</select></label>
        <div className={styles.editorActions}>{editor.id ? <button type="button" className={styles.danger} onClick={() => { deleteTask(editor.id!); setEditor(null) }}>{t('kanban.deleteTask')}</button> : null}<button type="button" className={styles.secondary} onClick={() => setEditor(null)}>{t('common.cancel')}</button><button type="submit" className={styles.primary} disabled={!editor.title.trim()}>{t('common.save')}</button></div>
      </form></div> : null}

      {context && contextTask ? <div ref={menuRef} className={styles.contextMenu} style={{ left: Math.max(8, context.x), top: Math.max(8, context.y) }}>
        <div className={styles.menuLabel}>{t('kanban.sendToTerminal')}</div>
        <div className={styles.menuProjects}>{projects.map((project) => <button key={project.id} type="button" className={context.projectId === project.id ? styles.menuSelected : ''} onClick={() => setContext({ ...context, projectId: project.id })}><Folder size={14} />{project.name}<ChevronRight size={14} /></button>)}</div>
        {contextProject ? <div className={styles.menuTerminals}>
          {contextProject.terminals.filter((terminal) => {
            const tab = terminal.tabs.find((item) => item.id === terminal.activeTabId)
            return terminal.kind === undefined && !terminal.disabled && !!tab && tab.type !== 'shell' && tab.type !== 'wsl'
          }).map((terminal) => <button key={terminal.id} type="button" onClick={() => void sendToExisting(contextTask, contextProject, terminal.id)}><SquareTerminal size={14} />{terminal.name}</button>)}
          <button type="button" onClick={() => sendToNew(contextTask, contextProject)}><Plus size={14} />{t('kanban.newCodexTerminal')}</button>
        </div> : <div className={styles.menuHint}>{t('kanban.chooseProject')}</div>}
      </div> : null}
    </div>
  )
}
