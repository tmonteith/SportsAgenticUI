import { expect, test, type APIRequestContext, type Page } from "@playwright/test"

const MOCK_STATE_URL = "http://localhost:8899/__state"
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

async function mockState(request: APIRequestContext) {
  const response = await request.get(MOCK_STATE_URL)
  return (await response.json()) as {
    disconnects: number
    lastMessages: { role: string; content: string }[]
    lastTelemetry: { sessionId: string | null; client: string | null; appVersion: string | null }
  }
}

async function ask(page: Page, prompt: string) {
  await page.getByRole("textbox", { name: "Ask about college football" }).fill(prompt)
  await page.keyboard.press("Enter")
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
})

test("streams a suggested prompt, then New chat resets the thread", async ({ page }) => {
  await page.getByRole("button", { name: "Who are the top 4 teams right now?" }).click()

  const log = page.getByRole("log", { name: "Conversation" })
  await expect(log.getByText("Looking up rankings…")).toBeVisible()
  await expect(log.getByText("Checked rankings")).toBeVisible()

  // Text arrives in pieces: the intro renders during a pause before the table is sent.
  await expect(log.getByText("Here's the")).toBeVisible()
  await expect(log.getByRole("table")).toHaveCount(0)

  const table = log.getByRole("table")
  await expect(table).toBeVisible()
  await expect(table.getByRole("row")).toHaveCount(5)
  await expect(table.getByRole("cell", { name: "Ohio State" })).toBeVisible()
  await expect(log.getByRole("strong")).toHaveText("latest top 4")
  await expect(log.getByRole("listitem")).toHaveCount(2)

  await page.getByRole("button", { name: "New chat" }).click()
  await expect(page.getByRole("list", { name: "Suggested questions" })).toBeVisible()
  await expect(log.getByText("Here's the")).toHaveCount(0)
})

test("sends the whole conversation back on follow-ups", async ({ page, request }) => {
  await ask(page, "Who is first?")
  await expect(page.getByRole("button", { name: "Regenerate response" })).toBeVisible()
  await ask(page, "And second?")
  await expect(page.getByRole("button", { name: "Regenerate response" })).toBeVisible()

  const { lastMessages } = await mockState(request)
  expect(lastMessages.map((message) => message.role)).toEqual(["user", "assistant", "user"])
  expect(lastMessages[0]?.content).toBe("Who is first?")
  expect(lastMessages[1]?.content).toContain("Georgia")
  expect(lastMessages[2]?.content).toBe("And second?")
})

test("sends telemetry headers through the proxy, with one session per tab", async ({
  page,
  request,
}) => {
  await ask(page, "Who is first?")
  await expect(page.getByRole("button", { name: "Regenerate response" })).toBeVisible()
  const { lastTelemetry: first } = await mockState(request)
  expect(first.sessionId).toMatch(UUID_V4)
  expect(first.client).toBe("web")
  expect(first.appVersion).toBe(process.env.VITE_APP_VERSION || "dev")

  // A reload keeps the tab's session.
  await page.reload()
  await ask(page, "Who is second?")
  await expect(page.getByRole("button", { name: "Regenerate response" })).toBeVisible()
  expect((await mockState(request)).lastTelemetry.sessionId).toBe(first.sessionId)

  // A new tab starts a new one.
  const otherTab = await page.context().newPage()
  await otherTab.goto("/")
  await ask(otherTab, "Who is third?")
  await expect(otherTab.getByRole("button", { name: "Regenerate response" })).toBeVisible()
  const { lastTelemetry: other } = await mockState(request)
  expect(other.sessionId).toMatch(UUID_V4)
  expect(other.sessionId).not.toBe(first.sessionId)
})

test("Stop cancels the request and keeps the partial answer", async ({ page, request }) => {
  const before = await mockState(request)
  await ask(page, "slow response please")
  await expect(page.getByText("word3")).toBeVisible()

  await page.getByRole("button", { name: "Stop response" }).click()
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible()
  await expect(page.getByText("word3")).toBeVisible()

  await expect.poll(async () => (await mockState(request)).disconnects).toBe(before.disconnects + 1)
})

test("Retry after an error regenerates the answer", async ({ page }) => {
  await ask(page, "fail once")
  const alert = page.getByRole("alert")
  await expect(alert).toContainText("temporarily unavailable")

  await alert.getByRole("button", { name: "Retry" }).click()
  await expect(page.getByRole("table")).toBeVisible()
  await expect(page.getByRole("alert")).toHaveCount(0)
})

test("regenerates the last answer", async ({ page, request }) => {
  await ask(page, "Who is first?")
  const regenerate = page.getByRole("button", { name: "Regenerate response" })
  await expect(regenerate).toBeVisible()
  await regenerate.click()
  await expect(page.getByRole("table")).toBeVisible()
  await expect(page.getByRole("table")).toHaveCount(1)
  expect((await mockState(request)).lastMessages).toHaveLength(1)
})

test("shows errors inline for failed requests and dropped connections", async ({ page }) => {
  await ask(page, "fail request")
  await expect(page.getByRole("alert")).toContainText("unavailable right now")
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible()

  await page.getByRole("button", { name: "New chat" }).click()
  await ask(page, "drop connection")
  await expect(page.getByText("Partial answer")).toBeVisible()
  await expect(page.getByRole("alert")).toContainText("connection was lost")
})

test("New chat during a response stops it and clears the thread", async ({ page, request }) => {
  const before = await mockState(request)
  await ask(page, "slow response please")
  await expect(page.getByText("word1")).toBeVisible()

  await page.getByRole("button", { name: "New chat" }).click()
  await expect(page.getByRole("list", { name: "Suggested questions" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible()
  await expect(page.getByText("word1")).toHaveCount(0)
  await expect.poll(async () => (await mockState(request)).disconnects).toBe(before.disconnects + 1)
})

test("works by keyboard alone, with Shift+Enter for a newline", async ({ page, request }) => {
  const input = page.getByRole("textbox", { name: "Ask about college football" })
  await expect(input).toBeFocused()
  await page.keyboard.type("line one")
  await page.keyboard.press("Shift+Enter")
  await page.keyboard.type("line two")
  await expect(input).toHaveValue("line one\nline two")
  await page.keyboard.press("Enter")

  await expect(page.getByRole("button", { name: "Regenerate response" })).toBeVisible()
  expect((await mockState(request)).lastMessages.at(-1)?.content).toBe("line one\nline two")

  await page.getByRole("button", { name: "Copy message" }).focus()
  await expect(page.getByRole("button", { name: "Copy message" })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: "Regenerate response" })).toBeFocused()
})

test("fits a 375px screen without sideways page scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await ask(page, "Who is first?")
  await expect(page.getByRole("table")).toBeVisible()

  const overflow = await page.evaluate(() => {
    const root = document.documentElement
    return root.scrollWidth - root.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(0)
  await expect(page.getByRole("textbox", { name: "Ask about college football" })).toBeInViewport()
})
