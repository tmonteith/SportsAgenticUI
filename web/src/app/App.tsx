import { useAui, useAuiState } from "@assistant-ui/react"
import { Plus } from "lucide-react"
import { Logo } from "@/components/chat/Logo"
import { Thread } from "@/components/chat/Thread"
import { Button } from "@/components/ui/button"

export function App() {
  const aui = useAui()
  const isRunning = useAuiState((state) => state.thread.isRunning)

  const startNewChat = () => {
    if (isRunning) aui.thread().cancelRun()
    aui.thread().reset()
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border px-4">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo className="size-6" />
            <h1 className="font-semibold tracking-tight">SportsAgentic</h1>
          </div>
          <Button variant="ghost" className="-mr-3" onClick={startNewChat}>
            <Plus />
            New chat
          </Button>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <Thread />
      </main>
    </div>
  )
}
