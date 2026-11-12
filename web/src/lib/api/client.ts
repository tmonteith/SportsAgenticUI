import { getTelemetryHeaders } from "@/lib/api/telemetry"
import { config } from "@/lib/config"
import { formatWait } from "@/lib/format"

export class ApiError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

const NETWORK_ERROR_MESSAGE = "Couldn't reach SportsAgentic. Check your connection and try again."
const SERVER_ERROR_MESSAGE = "SportsAgentic is unavailable right now. Please try again."
const REQUEST_ERROR_MESSAGE = "That request couldn't be processed. Please try again."
const RATE_LIMIT_FALLBACK_MESSAGE =
  "You've reached your limit for the hour. Please try again a little later."

/** Says when the next question frees up, from the agent's Retry-After seconds. */
export function rateLimitMessage(retryAfter: string | null): string {
  const seconds = Number(retryAfter)
  if (!retryAfter || !Number.isFinite(seconds) || seconds <= 0) return RATE_LIMIT_FALLBACK_MESSAGE
  return `You've reached your limit for the hour. You can ask again in ${formatWait(seconds * 1000)}.`
}

// Bearer tokens get added here when auth arrives.
export function getAuthHeaders(): Record<string, string> {
  return {}
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json")
  for (const [name, value] of Object.entries(getTelemetryHeaders())) headers.set(name, value)
  for (const [name, value] of Object.entries(getAuthHeaders())) headers.set(name, value)

  let response: Response
  try {
    response = await fetch(`${config.apiBasePath}${path}`, { ...init, headers })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ApiError(NETWORK_ERROR_MESSAGE)
  }

  if (!response.ok) {
    const message =
      response.status === 429
        ? rateLimitMessage(response.headers.get("Retry-After"))
        : response.status >= 500
          ? SERVER_ERROR_MESSAGE
          : REQUEST_ERROR_MESSAGE
    throw new ApiError(message, response.status)
  }
  return response
}
