# OpenCode Traffic Light

A TUI plugin that adds a status indicator to your terminal title bar, giving you a quick visual cue of what OpenCode is doing.

## Status Colors

| Color | Meaning |
|-------|---------|
| 🟢 Green | Idle, waiting for input, or pending permission/question |
| 🟡 Yellow | Busy but no active tool or text output (thinking) |
| 🔴 Red | Running tools or generating text |

## Installation

### Option 1: Install from GitHub (recommended)

Add to your project's `.opencode/tui.json`:

```jsonc
{
  "plugin": ["opencode-traffic-light@git+https://github.com/niushuai1991/opencode-traffic-light.git"]
}
```

Or install globally via `~/.config/opencode/tui.json`.

### Option 2: Local plugin file

Copy `src/index.ts` into your project's plugin directory:

```
.opencode/plugins/traffic-light.ts
```

### Option 3: Global plugin file

Copy `src/index.ts` to the global plugin directory:

```
~/.config/opencode/plugins/traffic-light.ts
```

## Usage

The traffic light activates automatically. The terminal title will look like:

- `🟢 OC | My Session` — idle
- `🟡 OC | My Session` — thinking
- `🔴 OC | My Session` — working

### Toggle

Run **"Toggle traffic light"** from the command palette to enable or disable the traffic light. The preference is persisted across sessions.

### Environment Variable

Set `OPENCODE_DISABLE_TERMINAL_TITLE=1` to prevent the plugin from modifying the terminal title.

## License

MIT
