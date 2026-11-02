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
