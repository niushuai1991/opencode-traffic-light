# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An OpenCode TUI plugin that adds a 🟢🟡🔴 traffic-light status indicator to the terminal title bar. Single-file plugin at `src/index.ts` — no build step, no dependencies beyond the OpenCode plugin SDK peer dependency.

## Architecture

The entire plugin lives in `src/index.ts` (~150 lines). Key design:

- **`computeTrafficLight(input)`** — Pure function (no SDK imports) that decides the color based on session state. Uses structural typing so it's independently testable without the real SDK.
- **`doUpdateTitle()`** — Reads state from the OpenCode TUI Plugin API (`api.state.session.*`, `api.state.part`, `api.route.current`) and sets the terminal title via `api.renderer.setTerminalTitle()`.
- **`scheduleUpdate()`** — Debounces updates with `setTimeout(fn, 0)` so rapid events (e.g. `message.part.delta` streaming) are coalesced into a single title update per frame, and the title write happens after OpenCode's own title effect.
- **14 event subscriptions** (`EVENTS` array) — Every relevant session/message/part/permission event triggers a debounced title refresh.
- **Toggle** — Registered as a palette command ("Toggle traffic light"), persisted via `api.kv.get/set`.
- **Disable** — Setting `OPENCODE_DISABLE_TERMINAL_TITLE=1` causes the plugin to exit early without registering any handlers.

## Color Decision Priority (highest first)

1. `enabled === false` → no title change
2. Session idle or no session status → 🟢 green
3. No messages → 🟢 green
4. Pending permission or question → 🟢 green
5. No assistant message or no parts → 🟡 yellow
6. Active (running/pending) tool part → 🔴 red
7. Active (non-synthetic, non-ignored) text part → 🔴 red
8. Default → 🟡 yellow

## Package Entry

The `exports` field in `package.json` maps `./tui` → `./src/index.ts`. OpenCode loads the plugin by reading this entry point. The default export must be a `TuiPluginModule` with an `id` and a `tui` async function.

## No Build/Lint/Test Tooling

This project has no build scripts, test runner, or linter configured. TypeScript is used only for editor type-checking (`noEmit: true`). There is no `dist/` — OpenCode consumes the TypeScript source directly.
