import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"

type StatusLightColor = "green" | "yellow" | "red"

type StatusLightInput = {
  enabled: boolean
  sessionStatus?: { type: string }
  messages?: readonly { role: string; id: string }[]
  pendingInput: boolean
  parts?: readonly {
    type: string
    state?: { status?: string }
    synthetic?: boolean
    ignored?: boolean
  }[]
}

function computeStatusLight(input: StatusLightInput): StatusLightColor | null {
  if (!input.enabled) return null
  if (!input.sessionStatus || input.sessionStatus.type === "idle") return "green"
  if (!input.messages || input.messages.length === 0) return "green"
  if (input.pendingInput) return "green"

  const lastAssistant = [...input.messages].reverse().find(m => m.role === "assistant")
  if (!lastAssistant) return "yellow"
  if (!input.parts || input.parts.length === 0) return "yellow"

  const hasActiveTool = input.parts.some(
    p => p.type === "tool" && (p.state?.status === "running" || p.state?.status === "pending"),
  )
  if (hasActiveTool) return "red"

  const hasActiveText = input.parts.some(
    p => p.type === "text" && !p.synthetic && !p.ignored,
  )
  if (hasActiveText) return "red"

  return "yellow"
}

function statusEmoji(color: StatusLightColor | null): string {
  if (color === "green") return "\u{1F7E2}"
  if (color === "yellow") return "\u{1F7E1}"
  if (color === "red") return "\u{1F534}"
  return ""
}

const EVENTS = [
  "session.status",
  "session.idle",
  "message.updated",
  "message.part.updated",
  "message.part.delta",
  "permission.asked",
  "permission.replied",
  "question.asked",
  "question.replied",
  "session.next.tool.called",
  "session.next.tool.success",
  "session.next.tool.failed",
  "session.next.text.started",
  "session.next.text.ended",
] as const

const tui: TuiPlugin = async (api) => {
  if (process.env.OPENCODE_DISABLE_TERMINAL_TITLE === "1") return

  const KV_KEY = "status_light_enabled"
  let enabled = api.kv.get<boolean>(KV_KEY, true)
  let timer: ReturnType<typeof setTimeout> | undefined

  function scheduleUpdate() {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(doUpdateTitle, 0)
  }

  function doUpdateTitle() {
    timer = undefined
    const route = api.route.current
    if (route.name !== "session") {
      api.renderer.setTerminalTitle("OpenCode")
      return
    }

    const sessionID = route.params.sessionID
    const status = api.state.session.status(sessionID)
    const messages = api.state.session.messages(sessionID)
    const permissions = api.state.session.permission(sessionID)
    const questions = api.state.session.question(sessionID)
    const lastAssistant = messages && [...messages].reverse().find(m => m.role === "assistant")
    const parts = lastAssistant ? api.state.part(lastAssistant.id) : undefined

    const color = computeStatusLight({
      enabled,
      sessionStatus: status ?? undefined,
      messages,
      pendingInput: permissions.length > 0 || questions.length > 0,
      parts,
    })
    const emoji = statusEmoji(color)

    const session = api.state.session.get(sessionID)
    const isDefaultTitle = !session?.title || session.title.trim() === ""
    if (isDefaultTitle) {
      api.renderer.setTerminalTitle(`${emoji} OpenCode`)
      return
    }

    const title =
      session!.title.length > 40 ? session!.title.slice(0, 37) + "..." : session!.title
    api.renderer.setTerminalTitle(`${emoji} OC | ${title}`)
  }

  const unsubscribers = EVENTS.map((event) => api.event.on(event, () => scheduleUpdate()))

  api.keymap.registerLayer({
    commands: [
      {
        name: "status_light.toggle",
        title: "Toggle status light",
        category: "Plugin",
        namespace: "palette",
        run() {
          enabled = !enabled
          api.kv.set(KV_KEY, enabled)
          api.ui.toast({
            variant: "info",
            message: `Status light ${enabled ? "enabled" : "disabled"}`,
          })
          scheduleUpdate()
        },
      },
    ],
    bindings: [],
  })

  api.lifecycle.onDispose(() => {
    if (timer !== undefined) clearTimeout(timer)
    unsubscribers.forEach((fn) => fn())
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-status-light",
  tui,
}

export default plugin
