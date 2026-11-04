import { apiFetch } from "@/lib/api/client"
import type { RateLimitStatus } from "@/lib/api/types"

export async function fetchRateLimit(signal?: AbortSignal): Promise<RateLimitStatus> {
  const response = await apiFetch("/rate-limit", { method: "GET", signal })
  return (await response.json()) as RateLimitStatus
}
