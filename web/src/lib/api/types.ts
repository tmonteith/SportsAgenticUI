export type ChatRole = "user" | "assistant"

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatStreamRequest {
  messages: ChatMessage[]
}

export type JsonObject = { readonly [key: string]: JsonValue }
export type JsonValue = string | number | boolean | null | JsonObject | readonly JsonValue[]

export type ChatStreamEvent =
  | { type: "message.delta"; text: string }
  | { type: "tool.start"; id: string; name: string; args: JsonObject }
  | { type: "tool.end"; id: string; name: string; ok: boolean }
  | { type: "error"; message: string }
  | { type: "done" }

/** GET /rate-limit: the caller's agent-turn budget. Fields are null when the limit is off. */
export interface RateLimitStatus {
  enabled: boolean
  limit: number | null
  remaining: number | null
  window_seconds: number | null
  /** Seconds until one more turn frees up; 0 when the budget is full. */
  next_seconds: number | null
  /** Seconds until every turn is back; 0 when the budget is full. */
  reset_seconds: number | null
}
