# Backend contract (Phase 0 findings)

Findings from reading `SportsAgenticAgent` (the FastAPI orchestrator), `SportsAgenticInfra`, the sibling Helm charts, and the live cluster on 2026-11-01.

## Differences from the build brief

| Brief said | What's actually there |
|---|---|
| Orchestrator calls the Anthropic API | It calls `llama-server` first and fails over to Google Gemini. Nothing calls Anthropic. |
| Router might be under `/api` | Routes are at the root (`/chat`, `/health`), so the ingress rewrites `/api/*`. |
| Existing ingress rules for the app | None. The only Ingress objects are temporary cert-manager ACME solvers. This chart creates the first app ingress. |
| Existing CI/CD platform | Only `SportsAgenticInfra` has GitHub Actions. The app repos have no workflows, so their images and Helm releases were pushed by hand. |

## 1. Chat endpoints

`POST /chat` (`app/main.py`) already existed and is unchanged:

```json
{
  "message": "string, required, min length 1",
  "history": [{ "role": "system|user|assistant|tool", "content": "string", "name": null, "tool_call_id": null }],
  "provider": "auto | llama | gemini | null",
  "skills": ["string"]
}
```

It returns `{ "reply": "...", "provider_used": "...", "fallback_triggered": false, "tool_calls": [...] }`. If every provider fails, it returns HTTP 502 with `{ "detail": "..." }`.

`POST /chat/stream` is new. See [section 4](#4-stream-events).

## 2. Conversation context

The client carries the context. Each request sends the full history, and the server stores no sessions or threads.

`/chat` takes `message` plus `history`. `/chat/stream` takes the brief's `{ "messages": [...] }` and splits it: the last message becomes the query and the rest become history. It only accepts `user` and `assistant` roles, so a browser can't inject a `system` message.

## 3. Response format

`/chat` returns one JSON body, and neither LLM client requests streamed output. Under the brief's decision rule, that means adding a streaming route alongside it. That route is `POST /chat/stream`, on branch `feat/chat-stream` in `SportsAgenticAgent`.

## 4. Stream events

The contract is the one in the brief. `text/event-stream`, with `Cache-Control: no-cache` and `X-Accel-Buffering: no`.

| event | data | notes |
|---|---|---|
| `tool.start` | `{ "id", "name", "args" }` | `id` is `<iteration>:<provider call id>`, because provider ids repeat across agent iterations. |
| `tool.end` | `{ "id", "name", "ok" }` | `ok` is false if the MCP call failed. The agent still continues the turn. |
| `message.delta` | `{ "text" }` | Sent once, with the whole reply. |
| `error` | `{ "message" }` | Fixed, generic text. Details stay in the server log. The stream ends after it. |
| `done` | `{}` | Stream complete. |

A `: ping` comment is sent after 15 seconds without an event. A client disconnect cancels the agent turn. The UI treats 45 seconds of silence, or a stream that ends without `done`, as a lost connection.

**Not token-by-token.** Tool activity streams live, but the answer arrives as a single delta. Real token streaming would need streaming support in both LLM clients, a failover rule for a provider that dies mid-stream, tool-call delta assembly, and a way to catch local models that write a tool call as JSON in their content. The UI already handles incremental deltas, so it needs no changes when the backend starts sending them.

## 5. Health and prefix

- `GET /health` returns `{ status: "ok" | "degraded", mcp_server, llama_server, gemini }`. It always returns 200, including when degraded.
- There's no router prefix, and `/tools`, `/skills`, `/docs`, and `/openapi.json` are also at the root.
- The UI calls `/api/...`. The ingress and the Vite proxy both strip `/api`.

## 6. Deployment today

| Item | Finding |
|---|---|
| Packaging | One Helm chart per repo at `charts/<name>`, installed by hand |
| Namespace | `sportsagentic` (Pod Security `baseline`) |
| Orchestrator | Deployment and Service `sportsagentic-agent`, ClusterIP port 8000 |
| Ingress controller | `ingress-nginx` chart 4.11.3 (controller 1.11.3), class `nginx`, the default class |
| TLS | Certificate `sportsagentic-tls` in `sportsagentic` covers the apex plus `www`, `agent`, `api`, `mcp`, `inference` |
| DNS | Apex and wildcard A records point to the ingress load balancer |
| Registry | OCIR, `ord.ocir.io/<namespace>/sportsagentic/*`, tagged with the git short SHA, pulled with the `ocir-pull` secret. Chart defaults still say `ghcr.io`; live releases override them. |
| Architecture | `node_shape` is currently `VM.Standard.E5.Flex` (amd64). The default is `VM.Standard.A1.Flex` (arm64), so images should be multi-arch. |
| Deploy access | `app-deployer-sa` can manage Deployments, Services, and Ingresses in the namespace |
| Cluster state | Node pool is scaled to 0, so pods stay Pending and the certificate can't issue until it's back up. |
