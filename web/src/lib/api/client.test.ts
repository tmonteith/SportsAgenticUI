import { afterEach, describe, expect, it, vi } from "vitest"
import { apiFetch, ApiError, rateLimitMessage } from "@/lib/api/client"

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

  it("tells the user when they've hit the hourly limit", async () => {
    const limited = new Response(
      JSON.stringify({ detail: "Limit of 10 requests per hour reached." }),
      {
        status: 429,
        headers: { "Retry-After": "1200" },
      },
    )
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(limited))
    const error = await apiFetch("/chat/stream").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 429,
      message: "You've reached your limit for the hour. You can ask again in 20 min.",
    })
  })

  it("falls back to a general wait when Retry-After is missing or not seconds", () => {
    const fallback = "You've reached your limit for the hour. Please try again a little later."
    expect(rateLimitMessage(null)).toBe(fallback)
    expect(rateLimitMessage("Wed, 04 Nov 2026 21:00:00 GMT")).toBe(fallback)
    expect(rateLimitMessage("45")).toBe(
      "You've reached your limit for the hour. You can ask again in 45s.",
    )
  })

  it("rethrows aborts untouched", async () => {
    const abort = new DOMException("Aborted", "AbortError")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort))
    await expect(apiFetch("/x")).rejects.toBe(abort)
  })
})
