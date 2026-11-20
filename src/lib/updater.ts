export type UpdateInfo = {
  version: string
  currentVersion: string
  notes: string | null
  date: string | null
}

export type UpdateProgress = { downloaded: number; total: number }

export async function installPendingUpdate(
  _onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  throw new Error('mosAIco updates are not configured for this build.')
}
