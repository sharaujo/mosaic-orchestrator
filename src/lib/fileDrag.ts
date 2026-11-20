export const MOSAICO_FILE_DRAG_TYPE = 'application/x-mosaico-file'

export type mosAIcoFileDragPayload = {
  projectId: string
  path: string
}

export function writeFileDragPayload(
  dataTransfer: DataTransfer,
  payload: mosAIcoFileDragPayload,
): void {
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(MOSAICO_FILE_DRAG_TYPE, JSON.stringify(payload))
  dataTransfer.setData('text/plain', payload.path)
}

export function readFileDragPayload(dataTransfer: DataTransfer): mosAIcoFileDragPayload | null {
  const raw = dataTransfer.getData(MOSAICO_FILE_DRAG_TYPE)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<mosAIcoFileDragPayload>
    if (typeof value.projectId !== 'string' || typeof value.path !== 'string') return null
    const projectId = value.projectId.trim()
    const path = value.path.trim()
    return projectId && path ? { projectId, path } : null
  } catch {
    return null
  }
}

export function hasFileDragPayload(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(MOSAICO_FILE_DRAG_TYPE)
}
