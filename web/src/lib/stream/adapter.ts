import type { ChatModelAdapter, ChatModelRunOptions, ChatModelRunResult } from "@assistant-ui/react"
import { apiFetch } from "@/lib/api/client"
import type { ChatMessage, ChatStreamEvent, ChatStreamRequest, JsonObject } from "@/lib/api/types"
import { parseSse, type SseMessage } from "@/lib/stream/sse"

const STREAM_PATH = "/chat/stream"
const CONNECTION_LOST_MESSAGE = "The connection was lost before the answer finished."
// The backend sends a heartbeat every 15s, so this is three missed in a row.
const STREAM_IDLE_TIMEOUT_MS = 45_000

type ThreadMessages = ChatModelRunOptions["messages"]
type RunContent = NonNullable<ChatModelRunResult["content"]>
type ToolCallPart = Extract<RunContent[number], { type: "tool-call" }>

function toChatMessages(messages: ThreadMessages): ChatMessage[] {
  const chatMessages: ChatMessage[] = []
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue
    const content = message.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n")
      .trim()
    // Failed or stopped turns can leave an assistant message with no text.
    if (content) chatMessages.push({ role: message.role, content })
  }
  return chatMessages
}

function toStreamEvent(message: SseMessage): ChatStreamEvent | undefined {
  if (!["message.delta", "tool.start", "tool.end", "error", "done"].includes(message.event)) {
    return undefined
  }
  const data = JSON.parse(message.data) as Omit<ChatStreamEvent, "type">
  return { ...data, type: message.event } as ChatStreamEvent
}

async function* readStreamEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<ChatStreamEvent, void> {
  try {
    for await (const message of parseSse(body, { signal, idleTimeoutMs: STREAM_IDLE_TIMEOUT_MS })) {
      const event = toStreamEvent(message)
      if (event) yield event
    }
  } catch (error) {
    if (signal.aborted) throw error
    // Failed reads and events cut off mid-JSON both mean the stream died.
    throw new Error(CONNECTION_LOST_MESSAGE, { cause: error })
  }
}

function startToolCall(id: string, name: string, args: JsonObject): ToolCallPart {
  return {
    type: "tool-call",
    toolCallId: id,
    toolName: name,
    args,
    argsText: JSON.stringify(args),
  }
}

function endToolCall(part: ToolCallPart, ok: boolean): ToolCallPart {
  return { ...part, result: { ok }, isError: !ok }
}

/**
 * Bridges the backend's SSE protocol to assistant-ui. Wire-format knowledge stays
 * in this file and sse.ts, so this is what gets swapped when moving to AG-UI.
 */
export const chatModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const request: ChatStreamRequest = { messages: toChatMessages(messages) }
    const response = await apiFetch(STREAM_PATH, {
      method: "POST",
      headers: { Accept: "text/event-stream" },
      body: JSON.stringify(request),
      signal: abortSignal,
    })
    if (!response.body) throw new Error(CONNECTION_LOST_MESSAGE)

    let text = ""
    const toolCalls = new Map<string, ToolCallPart>()
    const currentContent = (): RunContent => [
      ...toolCalls.values(),
      ...(text ? [{ type: "text" as const, text }] : []),
    ]

    for await (const event of readStreamEvents(response.body, abortSignal)) {
      switch (event.type) {
        case "message.delta":
          text += event.text
          break
        case "tool.start":
          toolCalls.set(event.id, startToolCall(event.id, event.name, event.args))
          break
        case "tool.end": {
          const part = toolCalls.get(event.id) ?? startToolCall(event.id, event.name, {})
          toolCalls.set(event.id, endToolCall(part, event.ok))
          break
        }
        case "error":
          throw new Error(event.message)
        case "done":
          // An explicit status stops the runtime re-running the model after tool results.
          yield { content: currentContent(), status: { type: "complete", reason: "stop" } }
          return
      }
      yield { content: currentContent() }
    }

    throw new Error(CONNECTION_LOST_MESSAGE)
  },
}
