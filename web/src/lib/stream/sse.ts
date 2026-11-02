export interface SseMessage {
  event: string
  data: string
}

export interface ParseSseOptions {
  signal?: AbortSignal
  /** Ends the stream if no bytes arrive for this long, heartbeat comments included. */
  idleTimeoutMs?: number
}

const abortError = () => new DOMException("The stream was aborted.", "AbortError")

class SseEventBuilder {
  private event = ""
  private dataLines: string[] = []

  /** Applies one line, returning a finished message when the line ends an event. */
  consume(line: string): SseMessage | undefined {
    if (line === "") return this.flush()
    if (line.startsWith(":")) return undefined

    const separator = line.indexOf(":")
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? "" : line.slice(separator + 1)
    if (value.startsWith(" ")) value = value.slice(1)

    if (field === "event") this.event = value
    if (field === "data") this.dataLines.push(value)
    return undefined
  }

  flush(): SseMessage | undefined {
    const message =
      this.dataLines.length > 0
        ? { event: this.event || "message", data: this.dataLines.join("\n") }
        : undefined
    this.event = ""
    this.dataLines = []
    return message
  }
}

/** Parses server-sent events from a fetch body. POST rules out the browser's EventSource. */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  { signal, idleTimeoutMs }: ParseSseOptions = {},
): AsyncGenerator<SseMessage, void> {
  if (signal?.aborted) throw abortError()

  const reader = body.getReader()
  const decoder = new TextDecoder()
  const builder = new SseEventBuilder()
  const cancelRead = () => void reader.cancel().catch(() => {})
  signal?.addEventListener("abort", cancelRead, { once: true })

  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const restartIdleTimer = () => {
    clearTimeout(idleTimer)
    if (idleTimeoutMs !== undefined) idleTimer = setTimeout(cancelRead, idleTimeoutMs)
  }

  try {
    let buffer = ""
    for (;;) {
      restartIdleTimer()
      const { done, value } = await reader.read()
      if (signal?.aborted) throw abortError()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      for (;;) {
        const ending = buffer.search(/\r\n|\r|\n/)
        if (ending === -1) break
        // A trailing \r may be half of a \r\n split across chunks.
        if (buffer[ending] === "\r" && ending === buffer.length - 1) break

        const line = buffer.slice(0, ending)
        buffer = buffer.slice(ending + (buffer.startsWith("\r\n", ending) ? 2 : 1))
        const message = builder.consume(line)
        if (message) yield message
      }
    }

    // A stream can end without the blank line that closes its last event.
    buffer += decoder.decode()
    for (const line of buffer.split(/\r\n|\r|\n/)) {
      const message = builder.consume(line)
      if (message) yield message
    }
    const trailing = builder.flush()
    if (trailing) yield trailing
  } finally {
    clearTimeout(idleTimer)
    signal?.removeEventListener("abort", cancelRead)
    cancelRead()
    reader.releaseLock()
  }
}
