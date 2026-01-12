# Claude Terminal

Embedded terminal for Obsidian with Claude Code integration.

## Features

- Full terminal emulator powered by xterm.js
- One-click Claude Code launch from ribbon menu
- Drag and drop files/folders to insert paths
- Right-click folder → "Open in Claude Code"
- Auto-focus after tab switch and double-ESC

## Requirements

- **macOS/Linux**: Python 3 (pre-installed)
- **Windows**: Python 3.7+
- **Claude Code CLI**: Required for AI features ([Install](https://docs.anthropic.com/en/docs/claude-code))

## Usage

1. Click terminal icon in left ribbon
2. Select "Open Terminal" or "Open Claude Code"
3. Or right-click any folder → "Open in Claude Code"

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+↓` | Scroll to bottom |
| `Cmd+↑` | Scroll to top |
| Double `ESC` | Auto-refocus terminal (after Claude Code action) |

## Note

This plugin uses a Python PTY helper to create a real pseudo-terminal, as Electron cannot use native node-pty modules.

---

# Claude Terminal（中文）

在 Obsidian 中嵌入终端，集成 Claude Code。

## 功能

- 基于 xterm.js 的完整终端模拟器
- 一键启动 Claude Code（左侧图标菜单）
- 拖放文件/文件夹自动插入路径
- 右键文件夹 → "Open in Claude Code"
- 切换标签页和双击 ESC 后自动聚焦

## 环境要求

- **macOS/Linux**: Python 3（系统自带）
- **Windows**: Python 3.7+
- **Claude Code CLI**: AI 功能需要（[安装指南](https://docs.anthropic.com/en/docs/claude-code)）

## 使用方法

1. 点击左侧边栏的终端图标
2. 选择 "Open Terminal" 或 "Open Claude Code"
3. 或右键任意文件夹 → "Open in Claude Code"

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd+↓` | 滚动到底部 |
| `Cmd+↑` | 滚动到顶部 |
| 双击 `ESC` | 自动聚焦终端 |
