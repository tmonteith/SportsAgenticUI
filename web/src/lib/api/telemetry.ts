// Headers the orchestrator records with each request. It stores null for anything
// malformed, so these only need to be well-formed, not trusted.

const SESSION_STORAGE_KEY = "sportsagentic.sessionId"
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let sessionId: string | undefined

function randomUuid(): string {
  // randomUUID only exists in secure contexts (HTTPS or localhost); getRandomValues is everywhere.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// Storage can be missing or throw (privacy modes, blocked site data), so the ID falls back to memory.
function readStoredSessionId(): string | undefined {
  try {
    const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    return stored && UUID_PATTERN.test(stored) ? stored : undefined
  } catch {
    return undefined
  }
}

function storeSessionId(id: string): void {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, id)
  } catch {
    // Memory only: the ID lasts until the tab reloads.
  }
}

/** One UUID per browser tab. sessionStorage keeps it across reloads; a new tab gets a new one. */
export function getSessionId(): string {
  if (sessionId) return sessionId
  sessionId = readStoredSessionId() ?? randomUuid()
  storeSessionId(sessionId)
  return sessionId
}

/** The build's version, set by CI from the image tag. */
export function getAppVersion(): string {
  return import.meta.env.VITE_APP_VERSION || "dev"
}

export function getTelemetryHeaders(): Record<string, string> {
  return {
    "X-Session-Id": getSessionId(),
    "X-Client": "web",
    "X-App-Version": getAppVersion(),
  }
}
