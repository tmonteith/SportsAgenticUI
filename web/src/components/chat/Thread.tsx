import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react"
import { ArrowDown, ArrowUp, Check, Copy, RefreshCw, Square } from "lucide-react"
import { Markdown } from "@/components/chat/Markdown"
import { ToolActivity } from "@/components/chat/ToolActivity"
import { Welcome } from "@/components/chat/Welcome"
import { Button } from "@/components/ui/button"

const MESSAGE_COMPONENTS = { UserMessage, AssistantMessage }
const PART_COMPONENTS = { Text: Markdown, tools: { Fallback: ToolActivity } }

export function Thread() {
  const isRunning = useAuiState((state) => state.thread.isRunning)

  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 [scrollbar-gutter:stable]">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
          <AuiIf condition={(state) => state.thread.isEmpty}>
            <Welcome />
          </AuiIf>

          <div
            role="log"
            aria-label="Conversation"
            aria-live="polite"
            aria-busy={isRunning}
            className="flex flex-col gap-6 py-6 empty:hidden"
          >
            <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />
          </div>

          <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto flex flex-col gap-2 bg-background pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <ThreadPrimitive.ScrollToBottom asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Scroll to latest message"
                className="absolute -top-11 self-center rounded-full disabled:invisible"
              >
                <ArrowDown />
              </Button>
            </ThreadPrimitive.ScrollToBottom>
            <Composer />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

function Composer() {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 focus-within:ring-2 focus-within:ring-ring">
      <ComposerPrimitive.Input
        aria-label="Ask about college football"
        placeholder="Ask about college football…"
        rows={1}
        autoFocus
        className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-muted-foreground"
      />
      <AuiIf condition={(state) => !state.thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <Button size="icon" aria-label="Send message" className="rounded-xl">
            <ArrowUp />
          </Button>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(state) => state.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <Button size="icon" variant="outline" aria-label="Stop response" className="rounded-xl">
            <Square className="fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </ComposerPrimitive.Root>
  )
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 wrap-anywhere whitespace-pre-wrap text-primary-foreground">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group flex flex-col gap-2">
      <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 empty:hidden">
        <MessagePrimitive.Parts components={PART_COMPONENTS} />
        <AuiIf condition={(state) => state.message.status?.type === "running"}>
          <AuiIf condition={(state) => state.message.parts.length === 0}>
            <p className="text-sm text-muted-foreground">Thinking…</p>
          </AuiIf>
        </AuiIf>
      </div>

      <MessagePrimitive.Error>
        <ErrorPrimitive.Root
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-sm"
        >
          <ErrorPrimitive.Message />
          <ActionBarPrimitive.Reload asChild>
            <Button variant="outline" size="sm">
              <RefreshCw />
              Retry
            </Button>
          </ActionBarPrimitive.Reload>
        </ErrorPrimitive.Root>
      </MessagePrimitive.Error>

      <AuiIf condition={(state) => state.message.status?.type !== "running"}>
        <ActionBarPrimitive.Root className="flex gap-1 empty:hidden">
          <AuiIf condition={(state) => state.message.parts.length > 0}>
            <ActionBarPrimitive.Copy asChild>
              <Button variant="ghost" size="icon" aria-label="Copy message">
                <AuiIf condition={(state) => state.message.isCopied}>
                  <Check />
                </AuiIf>
                <AuiIf condition={(state) => !state.message.isCopied}>
                  <Copy />
                </AuiIf>
              </Button>
            </ActionBarPrimitive.Copy>
          </AuiIf>
          <AuiIf
            condition={(state) =>
              state.message.isLast && state.message.status?.type !== "incomplete"
            }
          >
            <ActionBarPrimitive.Reload asChild>
              <Button variant="ghost" size="icon" aria-label="Regenerate response">
                <RefreshCw />
              </Button>
            </ActionBarPrimitive.Reload>
          </AuiIf>
        </ActionBarPrimitive.Root>
      </AuiIf>
    </MessagePrimitive.Root>
  )
}
