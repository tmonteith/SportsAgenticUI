import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const STORAGE_KEY = "sportsagentic.sessionId"

// A fresh import is a page load: module memory resets, sessionStorage stays.
async function loadTelemetry() {
  vi.resetModules()
  return import("@/lib/api/telemetry")
}

function throwing(name: string) {
  return () => {
    throw new DOMException("Storage is blocked", name)
  }
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("getSessionId", () => {
  it("is a UUID v4", async () => {
    const { getSessionId } = await loadTelemetry()
    expect(getSessionId()).toMatch(UUID_V4)
  })

  it("stays the same within a tab, across reloads", async () => {
    const page = await loadTelemetry()
    const id = page.getSessionId()
    expect(page.getSessionId()).toBe(id)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe(id)

    const reloaded = await loadTelemetry()
    expect(reloaded.getSessionId()).toBe(id)
  })

  it("is new in a new tab", async () => {
    const id = (await loadTelemetry()).getSessionId()
    sessionStorage.clear()
    const other = (await loadTelemetry()).getSessionId()
    expect(other).toMatch(UUID_V4)
    expect(other).not.toBe(id)
  })

  it("replaces a stored value that isn't a UUID", async () => {
    sessionStorage.setItem(STORAGE_KEY, "not-a-uuid")
    const { getSessionId } = await loadTelemetry()
    const id = getSessionId()
    expect(id).toMatch(UUID_V4)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe(id)
  })

  it("keeps one ID in memory when sessionStorage reads and writes throw", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(throwing("SecurityError"))
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(throwing("QuotaExceededError"))
    const { getSessionId } = await loadTelemetry()
    const id = getSessionId()
    expect(id).toMatch(UUID_V4)
    expect(getSessionId()).toBe(id)

    vi.restoreAllMocks()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("keeps one ID in memory when sessionStorage can't be accessed at all", async () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(throwing("SecurityError"))
    const { getSessionId } = await loadTelemetry()
    const id = getSessionId()
    expect(id).toMatch(UUID_V4)
    expect(getSessionId()).toBe(id)

    vi.restoreAllMocks()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("builds a UUID v4 from random bytes when randomUUID is missing", async () => {
    // Plain-HTTP pages have crypto.getRandomValues but not crypto.randomUUID.
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff) })
    const { getSessionId } = await loadTelemetry()
    expect(getSessionId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff")
  })

  it("sets the version and variant bits on all-zero bytes too", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(0) })
    const { getSessionId } = await loadTelemetry()
    expect(getSessionId()).toBe("00000000-0000-4000-8000-000000000000")
  })
})

describe("getAppVersion", () => {
  it("is dev when VITE_APP_VERSION is unset or empty", async () => {
    const { getAppVersion } = await loadTelemetry()
    vi.stubEnv("VITE_APP_VERSION", undefined)
    expect(getAppVersion()).toBe("dev")
    vi.stubEnv("VITE_APP_VERSION", "")
    expect(getAppVersion()).toBe("dev")
  })

  it("is the version the build was given", async () => {
    const { getAppVersion } = await loadTelemetry()
    vi.stubEnv("VITE_APP_VERSION", "050a10f")
    expect(getAppVersion()).toBe("050a10f")
  })
})

describe("getTelemetryHeaders", () => {
  it("sends values the orchestrator accepts", async () => {
    vi.stubEnv("VITE_APP_VERSION", "050a10f")
    const { getSessionId, getTelemetryHeaders } = await loadTelemetry()
    const headers = getTelemetryHeaders()

    expect(headers).toEqual({
      "X-Session-Id": getSessionId(),
      "X-Client": "web",
      "X-App-Version": "050a10f",
    })
    // The orchestrator's validation, from the telemetry contract.
    expect(headers["X-Session-Id"]).toMatch(UUID_V4)
    expect(headers["X-Client"]).toMatch(/^[a-z0-9._-]{1,32}$/)
    expect(headers["X-App-Version"]).toMatch(/^[A-Za-z0-9._+-]{1,64}$/)
  })
})
