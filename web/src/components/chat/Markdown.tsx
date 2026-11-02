import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown"
import { useSyncExternalStore, type ComponentProps } from "react"
import remarkGfm from "remark-gfm"

const REMARK_PLUGINS = [remarkGfm]
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

const MARKDOWN_COMPONENTS = {
  a: (props: ComponentProps<"a">) => <a {...props} target="_blank" rel="noreferrer noopener" />,
  // Wide rankings tables scroll inside the bubble instead of widening the page.
  table: (props: ComponentProps<"table">) => (
    <div className="markdown-table" tabIndex={0} role="region" aria-label="Scrollable table">
      <table {...props} />
    </div>
  ),
}

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
  )
}

export function Markdown() {
  const reducedMotion = usePrefersReducedMotion()
  return (
    <MarkdownTextPrimitive
      className="markdown"
      remarkPlugins={REMARK_PLUGINS}
      components={MARKDOWN_COMPONENTS}
      smooth={!reducedMotion}
    />
  )
}
