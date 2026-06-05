# bacli

bacli is a CLI agent for Business Analysts and System Administrators. It is modeled after Opencode's architecture.

## Architecture

- **Runtime**: Node.js 20+ / TypeScript 5.x
- **TUI**: Ink + React for terminal user interface
- **AI SDK**: Vercel AI SDK v6 for provider abstraction
- **Validation**: Zod v4 for schema validation
- **Storage**: SQLite via better-sqlite3
- **Config**: cosmiconfig with 2-layer merge (global + project)

## Source Structure

- `src/index.ts` - Entry point (Commander CLI)
- `src/config/` - Config loading with cosmiconfig + Zod validation
- `src/agent/` - Agent loop (SessionPrompt.loop pattern), permissions, compaction
- `src/tools/` - Tool registry and all tool implementations
- `src/providers/` - Provider abstraction (DeepSeek, OpenRouter, OpenAI-compatible)
- `src/storage/` - SQLite session persistence
- `src/bus/` - Global event bus (EventEmitter-based)
- `src/cli/tui/` - Ink + React TUI components
- `src/cli/server/` - HTTP + SSE server

## Agents

- `ba` - Business Analyst agent (default). Tools: document, spreadsheet, diagram, template, dataAnalysis, sql, bash, read, write, edit, glob, grep, webfetch, websearch
- `sysadmin` - System Administrator agent. Tools: ssh, scriptGen, docker, k8s, terraform, network, bash, read, write, edit, glob, grep, webfetch, websearch

## Key Files

- `src/agent/loop.ts` - Core agent loop (equivalent to Opencode's SessionPrompt.loop)
- `src/tools/builtins/edit.ts` - Edit tool with 9 matching strategies
- `src/tools/builtins/bash.ts` - Shell execution with permission system
- `src/tools/ba/document.ts` - DOCX/PDF/MD document generation (no watermarks)
- `src/tools/ba/spreadsheet.ts` - Excel workbook generation
- `src/tools/ba/diagram.ts` - Mermaid diagram generation
- `src/tools/ba/template.ts` - Document template engine with built-in templates
- `src/agent/permissions.ts` - Permission evaluator (allow/deny/ask)
- `src/agent/compaction.ts` - Context window management

## Providers

Default: DeepSeek V4 Flash via https://api.deepseek.com
Free tier: OpenRouter (deepseek/deepseek-v4-flash:free)
Compatible with any OpenAI-compatible endpoint.

## Building

```bash
npm run build    # Compile TypeScript to dist/
npm run binary   # Create standalone binary with pkg
```

## Installing

```bash
npm install -g @bacli/cli
# or
curl -fsSL https://bacli.dev/install | bash
```
