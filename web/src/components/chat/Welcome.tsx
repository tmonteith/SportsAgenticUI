import { ThreadPrimitive } from "@assistant-ui/react"
import { Logo } from "@/components/chat/Logo"
import { Button } from "@/components/ui/button"

// Limited to what the MCP tools can answer: rankings, scores, and schedules.
const SUGGESTED_PROMPTS = [
  "Who are the top 4 teams right now?",
  "What are this week's biggest games?",
  "What's left on Texas's schedule?",
  "How did Georgia do last week?",
]

export function Welcome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
      <Logo className="size-14" />
      <div className="space-y-2">
        <p className="text-3xl font-semibold tracking-tight">SportsAgentic</p>
        <p className="text-muted-foreground">
          Live scores, rankings, and schedules for college football.
        </p>
      </div>
      <ul className="grid w-full gap-2 sm:grid-cols-2" aria-label="Suggested questions">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <li key={prompt}>
            <ThreadPrimitive.Suggestion prompt={prompt} send asChild>
              <Button
                variant="outline"
                className="h-auto min-h-11 w-full justify-start px-4 py-2.5 text-left whitespace-normal"
              >
                {prompt}
              </Button>
            </ThreadPrimitive.Suggestion>
          </li>
        ))}
      </ul>
    </div>
  )
}
