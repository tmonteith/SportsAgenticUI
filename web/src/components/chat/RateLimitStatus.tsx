import { useAuiState } from "@assistant-ui/react"
import { useEffect, useState } from "react"
import { fetchRateLimit } from "@/lib/api/rateLimit"
import type { RateLimitStatus as RateLimitStatusResponse } from "@/lib/api/types"

interface Budget {
  limit: number
  remaining: number
  /** When one more question frees up, in epoch ms; 0 when the budget is full. */
  nextAt: number
  /** When every question is back, in epoch ms; 0 when the budget is full. */
  resetAt: number
}

/** Renders a wait as "45s", "12 min" or "1 hr". */
export function formatWait(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

function toBudget(status: RateLimitStatusResponse, now: number): Budget | null {
  if (!status.enabled || status.limit === null || status.remaining === null) return null
  return {
    limit: status.limit,
    remaining: status.remaining,
    nextAt: status.next_seconds ? now + status.next_seconds * 1000 : 0,
    resetAt: status.reset_seconds ? now + status.reset_seconds * 1000 : 0,
  }
}

function describe(budget: Budget, now: number): string {
  if (budget.remaining === 0) {
    return budget.nextAt > now
      ? `Limit reached · next question in ${formatWait(budget.nextAt - now)}`
      : "Limit reached"
  }
  const left = `${budget.remaining} of ${budget.limit} questions left`
  return budget.resetAt > now ? `${left} · resets in ${formatWait(budget.resetAt - now)}` : left
}

/**
 * Shows how many questions the visitor has left this hour and when they come back.
 * The window slides, so questions return one at a time: the count refreshes when the
 * next one frees up and after every turn.
 */
export function RateLimitStatus() {
  const isRunning = useAuiState((state) => state.thread.isRunning)
  // Changes whenever a turn starts or settles. A fast reply, such as a 429, can start and
  // end within one render, so isRunning alone can miss it.
  const turnKey = useAuiState((state) => {
    const last = state.thread.messages.at(-1)
    return `${state.thread.messages.length}:${last?.id ?? ""}:${last?.status?.type ?? ""}`
  })
  const [budget, setBudget] = useState<Budget | null>(null)
  const [now, setNow] = useState(0)
  const [wasRunning, setWasRunning] = useState(isRunning)
  // Bumped to fetch the budget again when a question comes back.
  const [poll, setPoll] = useState(0)

  // A turn counts the moment it starts, so take it off right away.
  if (isRunning !== wasRunning) {
    setWasRunning(isRunning)
    if (isRunning && budget && budget.remaining > 0) {
      setBudget({ ...budget, remaining: budget.remaining - 1 })
    }
  }

  // Fetch on mount, after each turn (including one that ended in a 429), and when a
  // question comes back. Not during a turn, when the count was just taken off locally.
  useEffect(() => {
    if (isRunning) return
    const controller = new AbortController()
    fetchRateLimit(controller.signal)
      .then((status) => {
        const fetchedAt = Date.now()
        setBudget(toBudget(status, fetchedAt))
        setNow(fetchedAt)
      })
      .catch(() => {
        // The counter is informational, so keep the last known budget.
      })
    return () => controller.abort()
  }, [isRunning, turnKey, poll])

  // Count down while a question is on its way back, and fetch again when it arrives.
  const nextAt = budget?.nextAt ?? 0
  useEffect(() => {
    if (!nextAt) return
    const timer = setInterval(() => {
      const tick = Date.now()
      setNow(tick)
      if (tick >= nextAt) {
        clearInterval(timer)
        setPoll((count) => count + 1)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [nextAt])

  if (!budget) return null
  return (
    <p className="px-1 text-center text-xs text-muted-foreground" data-testid="rate-limit-status">
      {describe(budget, now)}
    </p>
  )
}
