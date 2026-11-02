import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "@/app/App"
import { Providers } from "@/app/providers"

const encoder = new TextEncoder()
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function sseResponse(body: string, keepOpen = false) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body))
        if (!keepOpen) controller.close()
      },
    }),
    { status: 200 },
  )
}

const fetchMock = vi.fn<typeof fetch>()

function renderApp() {
  render(
    <Providers>
      <App />
    </Providers>,
  )
  return userEvent.setup()
}

function requestBody(call = 0) {
  return JSON.parse(fetchMock.mock.calls[call]?.[1]?.body as string) as {
    messages: { role: string; content: string }[]
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("chat UI", () => {
  it("sends a suggested prompt when its chip is clicked", async () => {
    fetchMock.mockResolvedValue(
      sseResponse(frame("message.delta", { text: "Georgia leads." }) + frame("done", {})),
    )
    const user = renderApp()

    await user.click(screen.getByRole("button", { name: "Who are the top 4 teams right now?" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(requestBody().messages).toEqual([
      { role: "user", content: "Who are the top 4 teams right now?" },
    ])
    expect(await screen.findByText("Georgia leads.")).toBeInTheDocument()
  })

  it("aborts the request when Stop is clicked", async () => {
    fetchMock.mockResolvedValue(sseResponse(frame("message.delta", { text: "Partial" }), true))
    const user = renderApp()

    await user.type(screen.getByRole("textbox", { name: /ask about/i }), "Hello{Enter}")
    await user.click(await screen.findByRole("button", { name: "Stop response" }))

    await waitFor(() => expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true))
    expect(await screen.findByRole("button", { name: "Send message" })).toBeInTheDocument()
  })

  it("shows the error inline with Retry, which sends the request again", async () => {
    fetchMock
      .mockResolvedValueOnce(sseResponse(frame("error", { message: "Temporarily unavailable." })))
      .mockResolvedValueOnce(
        sseResponse(frame("message.delta", { text: "Recovered." }) + frame("done", {})),
      )
    const user = renderApp()

    await user.type(screen.getByRole("textbox", { name: /ask about/i }), "Hello{Enter}")

    expect(await screen.findByRole("alert")).toHaveTextContent("Temporarily unavailable.")
    await user.click(screen.getByRole("button", { name: "Retry" }))

    expect(await screen.findByText("Recovered.")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("renders a markdown table as a table", async () => {
    const reply = "| Rank | Team |\n|---|---|\n| 1 | Georgia |\n"
    fetchMock.mockResolvedValue(
      sseResponse(frame("message.delta", { text: reply }) + frame("done", {})),
    )
    const user = renderApp()

    await user.type(screen.getByRole("textbox", { name: /ask about/i }), "Rankings{Enter}")

    const table = await screen.findByRole("table")
    expect(table.tagName).toBe("TABLE")
    expect(await screen.findByRole("cell", { name: "Georgia" })).toBeInTheDocument()
  })

  it("does not render raw HTML from a reply", async () => {
    const reply = '<img src=x onerror="alert(1)"> plain text'
    fetchMock.mockResolvedValue(
      sseResponse(frame("message.delta", { text: reply }) + frame("done", {})),
    )
    const user = renderApp()

    await user.type(screen.getByRole("textbox", { name: /ask about/i }), "Hello{Enter}")

    await waitFor(() => expect(screen.getByRole("button", { name: "Copy message" })).toBeVisible())
    expect(document.querySelector("img")).toBeNull()
  })

  it("marks the conversation as a polite live region", () => {
    renderApp()
    expect(screen.getByRole("log", { name: "Conversation", hidden: true })).toHaveAttribute(
      "aria-live",
      "polite",
    )
  })

  it("shows tool activity while a tool runs", async () => {
    fetchMock.mockResolvedValue(
      sseResponse(frame("tool.start", { id: "1:a", name: "get_team_schedule", args: {} }), true),
    )
    const user = renderApp()

    await user.type(screen.getByRole("textbox", { name: /ask about/i }), "Hello{Enter}")

    expect(await screen.findByText("Looking up the schedule…")).toBeInTheDocument()
  })

  it("says so when a tool fails", async () => {
    fetchMock.mockResolvedValue(
      sseResponse(
        frame("tool.start", { id: "1:a", name: "get_cfb_scores", args: {} }) +
          frame("tool.end", { id: "1:a", name: "get_cfb_scores", ok: false }),
        true,
      ),
    )
    const user = renderApp()

    await user.type(screen.getByRole("textbox", { name: /ask about/i }), "Hello{Enter}")

    expect(await screen.findByText("Couldn't check scores")).toBeInTheDocument()
  })

  it("falls back to the tool name for unknown tools", async () => {
    fetchMock.mockResolvedValue(
      sseResponse(frame("tool.start", { id: "1:a", name: "get_odds", args: {} }), true),
    )
    const user = renderApp()

    await user.type(screen.getByRole("textbox", { name: /ask about/i }), "Hello{Enter}")

    expect(await screen.findByText("Running get_odds…")).toBeInTheDocument()
  })
})
