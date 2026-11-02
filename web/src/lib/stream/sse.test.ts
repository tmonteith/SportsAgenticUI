import { describe, expect, it } from "vitest"
import { parseSse, type SseMessage } from "@/lib/stream/sse"

const encoder = new TextEncoder()

function streamOf(...chunks: (string | Uint8Array)[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk)
      }
      controller.close()
    },
  })
}

async function collect(source: AsyncIterable<SseMessage>) {
  const messages: SseMessage[] = []
  for await (const message of source) messages.push(message)
  return messages
}

describe("parseSse", () => {
  it("reassembles an event split across chunks", async () => {
    const stream = streamOf("eve", "nt: message.de", 'lta\ndata: {"te', 'xt":"hi"}\n', "\n")
    expect(await collect(parseSse(stream))).toEqual([
      { event: "message.delta", data: '{"text":"hi"}' },
    ])
  })

  it("parses several events in one chunk", async () => {
    const stream = streamOf("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n")
    expect(await collect(parseSse(stream))).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ])
  })

  it("joins multi-line data with newlines", async () => {
    const stream = streamOf("event: a\ndata: one\ndata: two\n\n")
    expect(await collect(parseSse(stream))).toEqual([{ event: "a", data: "one\ntwo" }])
  })

  it("ignores heartbeat comments between and inside events", async () => {
    const stream = streamOf(": ping\n\nevent: a\n: ping\ndata: 1\n\n: ping\n\n")
    expect(await collect(parseSse(stream))).toEqual([{ event: "a", data: "1" }])
  })

  it("handles CRLF line endings, including one split across chunks", async () => {
    const stream = streamOf("event: a\r\ndata: 1\r", "\n\r\n")
    expect(await collect(parseSse(stream))).toEqual([{ event: "a", data: "1" }])
  })

  it("keeps multi-byte characters that are split across chunks", async () => {
    const bytes = encoder.encode("data: é\n\n")
    const stream = streamOf(bytes.slice(0, 7), bytes.slice(7))
    expect(await collect(parseSse(stream))).toEqual([{ event: "message", data: "é" }])
  })

  it("dispatches a trailing event that has no closing blank line", async () => {
    const stream = streamOf("event: a\ndata: 1\n\nevent: b\ndata: 2")
    expect(await collect(parseSse(stream))).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ])
  })

  it("surfaces a stream that ends mid-event as truncated data", async () => {
    const stream = streamOf('event: a\ndata: {"text":"par')
    expect(await collect(parseSse(stream))).toEqual([{ event: "a", data: '{"text":"par' }])
  })

  it("yields nothing when a stream ends before any data", async () => {
    expect(await collect(parseSse(streamOf("event: a")))).toEqual([])
  })

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      collect(parseSse(streamOf("data: 1\n\n"), { signal: controller.signal })),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("stops a pending read and cancels the body when aborted", async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: 1\n\n"))
      },
      cancel() {
        cancelled = true
      },
    })
    const controller = new AbortController()
    const messages = parseSse(stream, { signal: controller.signal })

    await expect(messages.next()).resolves.toMatchObject({ value: { data: "1" } })
    const pending = messages.next()
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(cancelled).toBe(true)
  })

  it("ends a stream that goes silent, and heartbeats keep it alive", async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode("data: 1\n\n"))
        await new Promise((resolve) => setTimeout(resolve, 15))
        controller.enqueue(encoder.encode(": ping\n\n"))
        await new Promise((resolve) => setTimeout(resolve, 15))
        controller.enqueue(encoder.encode("data: 2\n\n"))
      },
      cancel() {
        cancelled = true
      },
    })

    const messages = await collect(parseSse(stream, { idleTimeoutMs: 25 }))

    expect(messages.map((message) => message.data)).toEqual(["1", "2"])
    expect(cancelled).toBe(true)
  })

  it("cancels the body when the consumer stops early", async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: 1\n\n"))
      },
      cancel() {
        cancelled = true
      },
    })
    for await (const message of parseSse(stream)) {
      expect(message.data).toBe("1")
      break
    }
    expect(cancelled).toBe(true)
  })
})
