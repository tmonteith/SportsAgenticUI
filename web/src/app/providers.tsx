import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react"
import type { ReactNode } from "react"
import { chatModelAdapter } from "@/lib/stream/adapter"

export function Providers({ children }: { children: ReactNode }) {
  const runtime = useLocalRuntime(chatModelAdapter)
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
