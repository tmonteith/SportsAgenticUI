import type { ToolCallMessagePartComponent } from "@assistant-ui/react"
import { Check, LoaderCircle, TriangleAlert } from "lucide-react"

const TOOL_LABELS: Record<string, { active: string; done: string; failed: string }> = {
  get_cfb_rankings: {
    active: "Looking up rankings…",
    done: "Checked rankings",
    failed: "Couldn't check rankings",
  },
  get_cfb_scores: {
    active: "Looking up scores…",
    done: "Checked scores",
    failed: "Couldn't check scores",
  },
  get_team_schedule: {
    active: "Looking up the schedule…",
    done: "Checked the schedule",
    failed: "Couldn't check the schedule",
  },
}

export const ToolActivity: ToolCallMessagePartComponent = ({ toolName, result, isError }) => {
  const label = TOOL_LABELS[toolName] ?? {
    active: `Running ${toolName}…`,
    done: `Ran ${toolName}`,
    failed: `Couldn't run ${toolName}`,
  }
  const finished = result !== undefined

  return (
    <div className="flex items-center gap-2 pb-1.5 text-xs text-muted-foreground">
      {isError ? (
        <TriangleAlert aria-hidden className="size-3.5 text-highlight" />
      ) : finished ? (
        <Check aria-hidden className="size-3.5" />
      ) : (
        <LoaderCircle aria-hidden className="size-3.5 animate-spin text-link" />
      )}
      <span>{isError ? label.failed : finished ? label.done : label.active}</span>
    </div>
  )
}
