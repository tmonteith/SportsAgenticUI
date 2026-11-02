import type { ChatModelRunOptions, ChatModelRunResult } from "@assistant-ui/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/client"
import { chatModelAdapter } from "@/lib/stream/adapter"

const encoder = new TextEncoder()

function sseResponse(body: string) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body))
        controller.close()
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  )
}

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function textMessage(role: "user" | "assistant", text: string) {
  return { role, content: [{ type: "text", text }] }
}

function run(
  messages: unknown[] = [textMessage("user", "Hi")],
  abortSignal = new AbortController().signal,
) {
  const options = { messages, abortSignal } as unknown as ChatModelRunOptions
  return chatModelAdapter.run(options) as AsyncGenerator<ChatModelRunResult, void>
}

async function collect(generator: AsyncGenerator<ChatModelRunResult, void>) {
  const results: ChatModelRunResult[] = []
  for await (const result of generator) results.push(result)
  return results
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("chatModelAdapter", () => {
  it("posts the conversation as role and text, skipping empty failed turns", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(frame("done", {})))
    vi.stubGlobal("fetch", fetchMock)

    await collect(
      run([
        textMessage("user", "Who is first?"),
        { role: "assistant", content: [] },
        {
          role: "assistant",
          content: [
            { type: "tool-call", toolCallId: "1", toolName: "x", args: {} },
            { type: "text", text: "Georgia" },
          ],
        },
        textMessage("user", "Second?"),
      ]),
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/chat/stream")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({
      messages: [
        { role: "user", content: "Who is first?" },
        { role: "assistant", content: "Georgia" },
        { role: "user", content: "Second?" },
      ],
    })
  })

  it("accumulates text deltas", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(
            frame("message.delta", { text: "Geo" }) +
              frame("message.delta", { text: "rgia" }) +
              frame("done", {}),
          ),
        ),
    )

    const results = await collect(run())
    expect(results.map((result) => result.content)).toEqual([
      [{ type: "text", text: "Geo" }],
      [{ type: "text", text: "Georgia" }],
      [{ type: "text", text: "Georgia" }],
    ])
  })

  it("surfaces tool start and end as tool-call parts before the text", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(
            frame("tool.start", { id: "1:a", name: "get_cfb_scores", args: { week: 3 } }) +
              frame("tool.end", { id: "1:a", name: "get_cfb_scores", ok: true }) +
              frame("tool.start", { id: "2:a", name: "get_cfb_scores", args: {} }) +
              frame("tool.end", { id: "2:a", name: "get_cfb_scores", ok: false }) +
              frame("message.delta", { text: "Done" }) +
              frame("done", {}),
          ),
        ),
    )

    const results = await collect(run())
    expect(results[0]?.content).toEqual([
      {
        type: "tool-call",
        toolCallId: "1:a",
        toolName: "get_cfb_scores",
        args: { week: 3 },
        argsText: '{"week":3}',
      },
    ])
    expect(results.at(-1)?.content).toEqual([
      expect.objectContaining({ toolCallId: "1:a", result: { ok: true }, isError: false }),
      expect.objectContaining({ toolCallId: "2:a", result: { ok: false }, isError: true }),
      { type: "text", text: "Done" },
    ])
  })

  it("finishes with an explicit status so the runtime doesn't re-run after tools", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frame("done", {}))))
    const results = await collect(run())
    expect(results.at(-1)?.status).toEqual({ type: "complete", reason: "stop" })
  })

  it("ignores unknown events", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(
            frame("metrics", { tokens: 3 }) +
              frame("message.delta", { text: "A" }) +
              frame("done", {}),
          ),
        ),
    )
    const results = await collect(run())
    expect(results).toHaveLength(2)
  })

  it("throws the server's message on an error event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sseResponse(frame("error", { message: "Try again later." }))),
    )
    await expect(collect(run())).rejects.toThrow("Try again later.")
  })

  it("throws when the stream ends without done", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sseResponse(frame("message.delta", { text: "Part" }))),
    )
    await expect(collect(run())).rejects.toThrow("connection was lost")
  })

  it("throws when the stream is cut mid-event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sseResponse('event: message.delta\ndata: {"te')),
    )
    await expect(collect(run())).rejects.toThrow("connection was lost")
  })

  it("turns a failed read into a readable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(frame("message.delta", { text: "Part" })))
            },
            pull(controller) {
              controller.error(new TypeError("network error"))
            },
          }),
        ),
      ),
    )
    await expect(collect(run())).rejects.toThrow("connection was lost")
  })

  it("throws a readable ApiError on HTTP failures and network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })))
    await expect(collect(run())).rejects.toBeInstanceOf(ApiError)

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    await expect(collect(run())).rejects.toThrow("Couldn't reach SportsAgentic")
  })

  it("passes the abort signal to fetch and stops mid-stream on abort", async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(stream) {
            stream.enqueue(encoder.encode(frame("message.delta", { text: "A" })))
          },
        }),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const generator = run(undefined, controller.signal)
    await expect(generator.next()).resolves.toMatchObject({ done: false })
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].signal).toBe(controller.signal)

    const pending = generator.next()
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })
})
