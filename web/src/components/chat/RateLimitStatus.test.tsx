import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "@/app/App"
import { Providers } from "@/app/providers"
import { formatWait } from "@/lib/format"
import type { RateLimitStatus } from "@/lib/api/types"

const encoder = new TextEncoder()
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function sseResponse(body: string) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body))
        controller.close()
      },
    }),
    { status: 200 },
  )
}

const status = (overrides: Partial<RateLimitStatus>): RateLimitStatus => ({
  enabled: true,
  limit: 10,
  remaining: 10,
  window_seconds: 3600,
  next_seconds: 0,
  reset_seconds: 0,
  ...overrides,
})

const statuses: RateLimitStatus[] = []
const chatMock = vi.fn<typeof fetch>()

function renderApp() {
  render(
    <Providers>
      <App />
    </Providers>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  statuses.length = 0
  chatMock.mockReset()
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).endsWith("/rate-limit")) return chatMock(input, init)
    // Each poll takes the next status; the last one repeats.
    const next = statuses.length > 1 ? statuses.shift() : statuses[0]
    return Promise.resolve(new Response(JSON.stringify(next), { status: 200 }))
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("rate limit counter", () => {
  it("shows the questions left and when they reset", async () => {
    statuses.push(status({ remaining: 7, next_seconds: 1310, reset_seconds: 3120 }))
    renderApp()
    expect(await screen.findByText("7 of 10 questions left · resets in 52 min")).toBeInTheDocument()
  })

  it("shows when the next question frees up once the limit is reached", async () => {
    statuses.push(status({ remaining: 0, next_seconds: 720, reset_seconds: 3500 }))
    renderApp()
    expect(await screen.findByText("Limit reached · next question in 12 min")).toBeInTheDocument()
  })

  it("takes a question off when a turn starts and confirms it when the turn ends", async () => {
    statuses.push(status({ remaining: 5, next_seconds: 600, reset_seconds: 3000 }))
    statuses.push(status({ remaining: 4, next_seconds: 600, reset_seconds: 3600 }))
    chatMock.mockResolvedValueOnce(
      sseResponse(frame("message.delta", { text: "Georgia." }) + frame("done", {})),
    )
    const user = renderApp()
    expect(await screen.findByText(/^5 of 10 questions left/)).toBeInTheDocument()

    await user.type(screen.getByRole("textbox", { name: /ask about/i }), "Who is #1?{Enter}")

    expect(await screen.findByText("Georgia.")).toBeInTheDocument()
    expect(await screen.findByText("4 of 10 questions left · resets in 1 hr")).toBeInTheDocument()
  })

  it("stays hidden when the limit is off", async () => {
    statuses.push({ ...status({}), enabled: false, limit: null, remaining: null })
    renderApp()
    await screen.findByRole("textbox", { name: /ask about/i })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByTestId("rate-limit-status")).not.toBeInTheDocument()
  })

  it("formats waits", () => {
    expect(formatWait(45_000)).toBe("45s")
    expect(formatWait(61_000)).toBe("2 min")
    expect(formatWait(3_600_000)).toBe("1 hr")
    expect(formatWait(4_500_000)).toBe("1 hr 15 min")
  })
})
