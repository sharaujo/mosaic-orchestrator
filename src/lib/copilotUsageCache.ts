import { getCopilotUsage } from './tauri'
import { makeTtlCache } from './ttlCache'

const TTL_MS = 5 * 60_000

export const getCachedCopilotUsage = makeTtlCache(getCopilotUsage, TTL_MS)
