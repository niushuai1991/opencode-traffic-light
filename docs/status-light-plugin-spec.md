# Status Light Plugin (状态灯插件)

通过 TUI 插件实现终端标题栏状态指示灯，实时反映 opencode 当前工作状态。

## 安装

将插件文件放置到插件目录：

```
.opencode/plugins/status-light.ts    # 项目级
~/.config/opencode/plugins/status-light.ts  # 全局
```

或在 `tui.json` 中通过 npm 包引用：

```jsonc
{
  "plugin": ["opencode-status-light"]
}
```

## 依赖的 TUI 插件 API

| API | 用途 |
|-----|------|
| `api.renderer.setTerminalTitle(title)` | 设置终端标题（带状态灯前缀） |
| `api.state.session.status(sessionID)` | 获取 session 状态（idle/busy/retry） |
| `api.state.session.messages(sessionID)` | 获取消息列表 |
| `api.state.session.permission(sessionID)` | 获取 pending permission 请求 |
| `api.state.session.question(sessionID)` | 获取 pending question 请求 |
| `api.state.part(messageID)` | 获取消息 parts |
| `api.state.session.get(sessionID)` | 获取 session 信息（标题等） |
| `api.route.current` | 获取当前路由（home/session 等） |
| `api.event.on(type, handler)` | 订阅实时事件，驱动标题更新 |
| `api.keymap.registerLayer()` | 注册命令（commands 数组格式） |
| `api.kv.get/set` | 存储插件开关状态 |
| `api.ui.toast()` | 显示状态切换提示 |
| `api.lifecycle.onDispose()` | 注册清理回调 |

## 事件订阅

插件需订阅以下事件以响应式更新标题：

| 事件 | 触发时机 |
|------|----------|
| `session.status` | session 状态变化（idle/busy） |
| `session.idle` | session 进入空闲 |
| `message.updated` | 消息更新 |
| `message.part.updated` | part 状态变化（tool running/complete 等） |
| `message.part.delta` | 文本流式输出（高频，需防抖） |
| `permission.asked` | 权限请求弹出 |
| `permission.replied` | 权限请求回复 |
| `question.asked` | 问题请求弹出 |
| `question.replied` | 问题回复 |
| `session.next.tool.called` | tool 被调用 |
| `session.next.tool.success` | tool 执行成功 |
| `session.next.tool.failed` | tool 执行失败 |
| `session.next.text.started` | 文本输出开始 |
| `session.next.text.ended` | 文本输出结束 |

## 状态灯颜色逻辑

`computeStatusLight` 是一个纯函数，使用结构类型（structural typing）避免依赖 SDK 具体类型，便于独立测试：

| 优先级 | 条件 | 颜色 |
|--------|------|------|
| 1 | `enabled === false` | `null`（不设置标题） |
| 2 | session 状态为 `idle` 或无状态 | 🟢 green |
| 3 | 无消息 | 🟢 green |
| 4 | 有 pending permission 或 question | 🟢 green |
| 5 | 无 assistant 消息 | 🟡 yellow |
| 6 | 无 parts | 🟡 yellow |
| 7 | 有 running/pending 的 tool part | 🔴 red |
| 8 | 有非 synthetic、非 ignored 的 text part | 🔴 red |
| 9 | 默认 | 🟡 yellow |

## 实现

```ts
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
    p => p.type === "tool" && (p.state?.status === "running" || p.state?.status === "pending")
  )
  if (hasActiveTool) return "red"

  const hasActiveText = input.parts.some(
    p => p.type === "text" && !p.synthetic && !p.ignored
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

    const title = session!.title.length > 40
      ? session!.title.slice(0, 37) + "..."
      : session!.title
    api.renderer.setTerminalTitle(`${emoji} OC | ${title}`)
  }

  const unsubscribers = EVENTS.map(event =>
    api.event.on(event, () => scheduleUpdate())
  )

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
    unsubscribers.forEach(fn => fn())
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-status-light",
  tui,
}

export default plugin
```

## 挑战与注意事项

### 标题竞争

`app.tsx` 中有一个 `createEffect` 会在路由变化时设置终端标题。插件设置的状态灯标题可能被主 effect 覆盖。

**解决方案**：所有 `updateTitle` 调用通过 `setTimeout(fn, 0)` 延迟一帧执行，确保在主 effect 之后运行。连续事件会自动合并（取消前一个 timer，设置新 timer）。

### 终端标题开关

用户可能已通过内置的 `terminal_title_toggle` 命令关闭终端标题。插件应尊重此设置。

**解决方案**：无法直接读取 KV 中的 `terminal_title_enabled`（它是 TUI 内部信号）。可通过 `OPENCODE_DISABLE_TERMINAL_TITLE` 环境变量进行粗略判断，或接受插件标题设置与内置开关可能冲突的局限。

### 环境变量

`OPENCODE_DISABLE_TERMINAL_TITLE=1` 时插件直接 return，不注册任何事件或命令。

### 性能

`message.part.delta` 事件在流式输出时高频触发。通过 `setTimeout` 合并连续调用，同一帧内多次事件只会执行一次标题更新。`computeStatusLight` 使用纯函数 + 结构类型，无额外依赖开销。

## 文件结构

```
opencode-status-light/
├── src/
│   └── index.ts          # 插件入口，default export
├── package.json
└── tsconfig.json
```

## package.json

```json
{
  "name": "opencode-status-light",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    "./tui": "./src/index.ts"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": ">=1.0.0"
  },
  "engines": {
    "opencode": ">=1.0.0"
  }
}
```

## 与源码修改方案的差异

源码修改方案（`opencode_status_light`）在 `packages/core` 中添加 `computeStatusLight` 共享函数，被 TUI 和 Web UI 同时使用。插件方案独立打包，不修改 opencode 源码，仅通过 TUI Plugin API 实现，功能上完全等价。
