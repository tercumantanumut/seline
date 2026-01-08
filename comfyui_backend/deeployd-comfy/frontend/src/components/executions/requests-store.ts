export type SavedRequest = {
  id: string
  method: string
  path: string
  status: number
  latency_ms: number
  time: string
  requestBody?: string
  responseText?: string
}

const KEY = 'exec.requests.log'

export function saveRequest(entry: SavedRequest) {
  try {
    const arr: SavedRequest[] = JSON.parse(localStorage.getItem(KEY) || '[]')
    arr.unshift(entry)
    localStorage.setItem(KEY, JSON.stringify(arr.slice(0, 200)))
  } catch {}
}

export function loadRequests(): SavedRequest[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch { return [] }
}

export function clearRequests() {
  try { localStorage.removeItem(KEY) } catch {}
}
