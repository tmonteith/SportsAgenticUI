import { afterEach, describe, expect, it, vi } from "vitest"
import { apiFetch, ApiError } from "@/lib/api/client"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("apiFetch", () => {
  it("prefixes the base path and defaults to JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"))
    vi.stubGlobal("fetch", fetchMock)

    await apiFetch("/health")

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/health")
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json")
  })

  it("normalizes HTTP failures without exposing response bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("stack trace", { status: 503 })))
    const error = await apiFetch("/x").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 503, message: expect.stringContaining("unavailable") })
    expect((error as ApiError).message).not.toContain("stack trace")
  })

  it("rethrows aborts untouched", async () => {
    const abort = new DOMException("Aborted", "AbortError")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort))
    await expect(apiFetch("/x")).rejects.toBe(abort)
  })
})
