// Mock of POST /chat/stream for e2e tests and local UI work. No API keys or orchestrator needed.
// The last user message picks a scenario. Routes sit at the root, like the real backend's.
import { createServer } from "node:http"

const PORT = Number(process.env.MOCK_PORT ?? 8899)
const STEP_MS = Number(process.env.MOCK_STEP_MS ?? 120)

const TABLE_INTRO = "Here's the **latest top 4**:\n\n"
const TABLE_REPLY = `| Rank | Team | Record |
|---|---|---|
| 1 | Georgia | 9-0 |
| 2 | Ohio State | 9-0 |
| 3 | Texas | 8-1 |
| 4 | Oregon | 8-1 |

- Georgia holds the top spot
- Texas moved up one place

Check the \`get_cfb_rankings\` tool for more.`

const state = { requests: 0, disconnects: 0, lastMessages: [] }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

async function sendText(res, text, isOpen) {
  // Whole words at a time, so incremental rendering is visible.
  for (const piece of text.match(/\S+\s*/g) ?? []) {
    if (!isOpen()) return
    send(res, "message.delta", { text: piece })
    await sleep(STEP_MS / 4)
  }
}

async function runScenario(res, prompt, isOpen) {
  if (prompt.includes("fail stream")) {
    send(res, "error", { message: "The assistant is temporarily unavailable. Please try again." })
    return
  }
  if (prompt.includes("drop connection")) {
    // Ends without done. A destroyed socket would hang behind Vite's proxy, which
    // doesn't pass the failure on; the adapter's idle timeout covers that case.
    send(res, "message.delta", { text: "Partial answer" })
    await sleep(STEP_MS)
    return
  }
  if (prompt.includes("slow")) {
    send(res, "tool.start", { id: "1:call_1", name: "get_cfb_scores", args: {} })
    for (let tick = 0; tick < 200 && isOpen(); tick += 1) {
      res.write(": ping\n\n")
      send(res, "message.delta", { text: `word${tick} ` })
      await sleep(STEP_MS)
    }
    return
  }

  send(res, "tool.start", { id: "1:call_1", name: "get_cfb_rankings", args: { week: 9 } })
  await sleep(STEP_MS * 3)
  res.write(": ping\n\n")
  send(res, "tool.end", { id: "1:call_1", name: "get_cfb_rankings", ok: true })
  await sendText(res, TABLE_INTRO, isOpen)
  await sleep(STEP_MS * 6)
  await sendText(res, TABLE_REPLY, isOpen)
  if (isOpen()) send(res, "done", {})
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/__state") {
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify(state))
    return
  }
  if (req.method !== "POST" || req.url !== "/chat/stream") {
    res.statusCode = 404
    res.end()
    return
  }

  let body = ""
  for await (const chunk of req) body += chunk
  const { messages } = JSON.parse(body)
  state.requests += 1
  state.lastMessages = messages
  const prompt = messages.at(-1)?.content ?? ""

  if (prompt.includes("fail request")) {
    res.statusCode = 500
    res.end()
    return
  }
  // Retrying "fail once" succeeds, so Retry can be exercised end to end.
  const failOnce = prompt.includes("fail once") && state.requests % 2 === 1

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  })
  res.flushHeaders()

  let open = true
  res.on("close", () => {
    if (open && !res.writableEnded) state.disconnects += 1
    open = false
  })

  await runScenario(res, failOnce ? "fail stream" : prompt, () => open)
  open = false
  res.end()
})

server.listen(PORT, () => console.log(`Mock SSE server on http://localhost:${PORT}`))
