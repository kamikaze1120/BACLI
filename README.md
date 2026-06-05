# bacli

**CLI agent for Business Analysts and System Administrators**

bacli is an AI-powered terminal agent that helps Business Analysts generate documents, analyze data, and design diagrams, while giving System Administrators the power to orchestrate infrastructure, write scripts, and manage deployments — all from the command line.

Built on top of the Vercel AI SDK with a full Ink + React terminal UI, bacli supports multiple AI providers (DeepSeek, OpenRouter, OpenAI-compatible), persistent SQLite session storage, and a flexible permission system.

---

## Features

- **Two agent modes** — BA agent for requirements, docs, data analysis; SysAdmin agent for scripts, Docker, K8s, Terraform
- **Full TUI** — Split-pane terminal UI with streaming text, tool status, session switching, and keyboard navigation
- **Document generation** — Create DOCX, PDF, and Markdown documents with zero watermarks or branding
- **Diagrams** — Generate Mermaid flowcharts, ERDs, sequence diagrams, and more
- **Spreadsheets** — Create Excel workbooks from data
- **Templates** — Built-in BRD, FRD, and User Story templates via Handlebars
- **Data analysis** — Analyze CSV and JSON data in-place
- **SQL tools** — Query analysis, optimization suggestions, and dialect-specific guidance
- **Script generation** — Generate Bash, PowerShell, Python, and Batch scripts
- **Infrastructure as Code** — Docker Compose, Kubernetes manifests, Terraform configurations
- **Session persistence** — All conversations saved to SQLite, forkable and searchable
- **Context compaction** — Automatic pruning of old tool results to stay within context windows
- **Permission system** — Fine-grained allow/ask/deny rules per tool and agent with glob patterns
- **Multi-provider** — DeepSeek (default), OpenRouter, or any OpenAI-compatible endpoint
- **Memory system** — Persistent memory file for cross-session context retention
- **HTTP server mode** — SSE-based server for remote agent access

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      bacli CLI                              │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌──────────┐  │
│  │ TUI      │  │ HTTP     │  │ CLI        │  │ Config   │  │
│  │ (Ink)    │  │ Server   │  │ (Commander)│  │ (Zod)    │  │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘  └────┬─────┘  │
│       └──────────────┴──────────────┴──────────────┘        │
│                              │                               │
│  ┌──────────────────────────┴──────────────────────────┐    │
│  │               Agent Loop                             │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │    │
│  │  │ Provider │  │ Tools    │  │ Permission       │  │    │
│  │  │ (AI SDK) │  │ (20+)    │  │ System           │  │    │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                               │
│  ┌──────────────────────────┴──────────────────────────┐    │
│  │               Storage (SQLite)                       │    │
│  │  sessions │ messages │ message_parts │ compaction   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Key components

| Component | File | Description |
|-----------|------|-------------|
| CLI entry | `src/index.ts` | Commander CLI with subcommands |
| Agent loop | `src/agent/loop.ts` | Core loop: LLM → tools → result → repeat |
| Config | `src/config/schema.ts` | Zod v4 schema, cosmiconfig loader |
| Permissions | `src/agent/permissions.ts` | Allow/ask/deny with glob pattern matching |
| Tools | `src/tools/` | 20+ tool implementations in 3 categories |
| TUI | `src/cli/tui/App.tsx` | Ink + React split-pane terminal UI |
| Storage | `src/storage/` | SQLite CRUD for sessions and messages |
| Event bus | `src/bus/event-bus.ts` | Typed global event emitter |
| Compaction | `src/agent/compaction.ts` | Token-based context pruning |

---

## Prerequisites

- **Node.js 20+** (LTS recommended)
- An API key for your AI provider:
  - [DeepSeek](https://platform.deepseek.com/api_keys) (default)
  - [OpenRouter](https://openrouter.ai/keys) (free tier available)

---

## Installation

### Quick install (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/kamikaze1120/BACLI/main/install.sh | bash
```

This tries `npm install -g @bacli/cli` first, then falls back to downloading a binary.

### npm global install

```bash
# From the repo directory
npm install -g .

# Or if published to a private npm registry
npm install -g @bacli/cli
```

### From source

```bash
git clone https://github.com/kamikaze1120/BACLI.git
cd BACLI
npm install
npm run build
npm link
```

### Binary (via pkg)

```bash
npm run binary
./dist/bacli.exe  # Windows
```

### Verify installation

```bash
bacli --help
```

---

## Configuration

bacli looks for configuration in this order (later overrides earlier):

1. **Global config** — `~/.config/bacli/config.json`
2. **Project config** — `.baclirc.json` in current directory
3. **Environment variables** — `BACLI_API_KEY`, `BACLI_MODEL`, `BACLI_PROVIDER`, `BACLI_BASE_URL`

### Quick start

```bash
# Set your API key
export DEEPSEEK_API_KEY="sk-your-key-here"

# Start the BA agent
bacli "Create a BRD for a customer portal"
```

### Create project config

```bash
bacli init
```

This creates `.baclirc.json`:

```json
{
  "$schema": "https://bacli.dev/config.json",
  "model": "deepseek-v4-flash",
  "provider": "deepseek",
  "apiKey": "${DEEPSEEK_API_KEY}",
  "baseUrl": "https://api.deepseek.com"
}
```

### Full configuration options

```json
{
  "$schema": "https://bacli.dev/config.json",
  "model": "deepseek-v4-flash",
  "provider": "deepseek",
  "baseUrl": "https://api.deepseek.com",
  "apiKey": "${DEEPSEEK_API_KEY}",
  "smallModel": "deepseek-v4-flash",
  "shell": "powershell",
  "logLevel": "INFO",
  "username": "user",

  "agent": {
    "ba": {
      "description": "Business Analyst agent",
      "prompt": "Custom system prompt additions for BA",
      "model": "deepseek-v4-flash",
      "temperature": 0.7,
      "steps": 25,
      "permission": {
        "edit": "allow",
        "bash": "ask",
        "read": "allow",
        "glob": "allow",
        "grep": "allow",
        "webfetch": "allow",
        "websearch": "allow"
      }
    },
    "sysadmin": {
      "description": "System Administrator agent",
      "permission": {
        "edit": "allow",
        "bash": "allow",
        "read": "allow",
        "ssh": "ask"
      }
    }
  },

  "permission": {
    "read": {
      "*.env": "ask",
      "*.env.*": "ask"
    }
  },

  "toolOutput": {
    "maxLines": 200,
    "maxBytes": 8192
  },

  "compaction": {
    "auto": true,
    "tailTurns": 15
  }
}
```

### AI providers

You can use any OpenAI-compatible provider by changing `provider` and `baseUrl`:

```bash
# OpenRouter (free tier)
export BACLI_PROVIDER=openrouter
export BACLI_BASE_URL=https://openrouter.ai/api/v1
export BACLI_API_KEY="sk-or-..."

# Local LLM (Ollama, LM Studio, etc.)
export BACLI_PROVIDER=local
export BACLI_BASE_URL=http://localhost:11434/v1
export BACLI_API_KEY="dummy"
```

---

## Usage

### Starting the agent

```powershell
# Start BA agent (default)
bacli

# Start BA agent with an initial prompt
bacli "Create a BRD for an inventory management system"

# Start SysAdmin agent
bacli sysadmin

# Start SysAdmin agent with a prompt
bacli sysadmin "Create a Docker Compose for a Node.js + PostgreSQL app"

# Specify model/provider
bacli --model deepseek-v4-flash --provider deepseek
bacli sysadmin --model mistralai/mistral-7b-instruct:free
```

### TUI keyboard shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Switch between BA and SysAdmin agents |
| `Ctrl+P` | Open session list (pick to switch) |
| `Ctrl+C` | Cancel current generation |
| `Ctrl+C` (twice) | Exit bacli |
| `Esc` | Close session picker |

### Writing prompts

You can type naturally. The agent understands your tools and uses them autonomously:

**BA prompts:**
- "Create a BRD for a customer onboarding portal with stakeholder analysis"
- "Analyze this CSV and give me insights: data.csv"
- "Generate a sequence diagram for the login flow"
- "Create an Excel sheet with monthly sales data"
- "Write a SQL query to find top 10 customers by revenue"

**SysAdmin prompts:**
- "Create a Docker Compose for a MERN stack app"
- "Generate Kubernetes deployment + service for nginx"
- "Write a Bash backup script for PostgreSQL"
- "Create Terraform to deploy an EC2 instance"
- "SSH into the server and check disk usage"

### Managing sessions

- Sessions are automatically saved to SQLite (`~/.config/bacli/sessions.db`)
- Use `Ctrl+P` in the TUI to view and switch between sessions
- Sessions can be forked (continued from any point)
- Titles are auto-generated from the first prompt

### Memory system

bacli maintains a persistent memory file that the agent reads and writes across sessions. This allows it to remember user preferences, project context, and important facts.

**Memory file locations:**
- **Global**: `~/.config/bacli/memory.md`
- **Project**: `.bacli/memory.md` (overrides global)

The agent automatically consults memory at the start of each session and can update it during a conversation. You can also edit the file manually:

```bash
# View current memory
cat ~/.config/bacli/memory.md

# Edit memory
nano ~/.config/bacli/memory.md
```

---

## Commands

```
Usage: bacli [options] [prompt]

CLI agent for Business Analysts and System Administrators

Arguments:
  prompt                   Initial prompt for the BA agent

Options:
  -V, --version            Output the version number
  -m, --model <model>      Model ID to use
  -p, --provider <provider> Provider name
  -h, --help               Display help

Commands:
  sysadmin [prompt]        Start System Administrator agent
  init                     Create .baclirc.json in current directory
  config <action> <key>    Get or set config values
  serve [options]          Start HTTP server with SSE
  help [command]           Display help for command
```

---

## Tool reference

### Built-in tools (both agents)

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands (respects permission rules) |
| `read` | Read files with optional offset/limit |
| `write` | Write content to files |
| `edit` | Edit files using 9 matching strategies (exact, trimmed, block-anchor, regex, patterns) |
| `glob` | Find files by glob pattern |
| `grep` | Search file contents by regex |
| `webfetch` | Fetch and convert web content to markdown |
| `websearch` | Search the web for information |

### BA tools

| Tool | Description |
|------|-------------|
| `document` | Generate DOCX, PDF, or Markdown documents (no watermarks) |
| `spreadsheet` | Create Excel workbooks with data and formatting |
| `diagram` | Generate Mermaid diagrams (flowchart, ERD, sequence, class, Gantt) |
| `template` | Load and fill document templates (BRD, FRD, User Story) |
| `dataAnalysis` | Analyze CSV/JSON data with statistical summaries |
| `sql` | Analyze SQL query structure and get optimization suggestions |

### SysAdmin tools

| Tool | Description |
|------|-------------|
| `ssh` | Execute commands on remote systems over SSH |
| `scriptGen` | Generate Bash/PowerShell/Python/Batch scripts |
| `docker` | Create Dockerfiles and Docker Compose configurations |
| `k8s` | Generate Kubernetes manifests (Deployment, Service, ConfigMap, etc.) |
| `terraform` | Create Terraform configurations |
| `network` | Network diagnostics and configuration generation |

---

## Permission system

bacli uses a flexible permission system modeled after Opencode. Each tool can be configured with one of three actions:

| Action | Behavior |
|--------|----------|
| `allow` | Tool runs automatically without prompting |
| `ask` | User is asked for confirmation before each execution |
| `deny` | Tool is blocked and returns an error |

### How rules are evaluated

1. Global permissions are checked first (from `config.permission`)
2. Agent-specific permissions override global (from `config.agent.<name>.permission`)
3. Permission rules use glob patterns: `{ "*.env": "deny" }`

### Permission examples

```json
{
  "permission": {
    "read": { "*.env": "ask", "*.key": "deny" },
    "bash": "ask",
    "edit": "allow"
  },
  "agent": {
    "ba": {
      "permission": {
        "bash": "ask",
        "ssh": "deny"
      }
    },
    "sysadmin": {
      "permission": {
        "bash": "allow",
        "ssh": "ask"
      }
    }
  }
}
```

---

## Development

### Setup

```bash
git clone https://github.com/kamikaze1120/BACLI.git
cd BACLI
npm install
npm run build
npm link
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled version |
| `npm run dev` | Run with `tsx` (no compile step) |
| `npm test` | Run all tests (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run binary` | Create standalone binary with pkg |

### Project structure

```
bacli/
├── src/
│   ├── index.ts                 # Entry point
│   ├── agent/
│   │   ├── loop.ts              # Core agent loop
│   │   ├── permissions.ts       # Permission evaluator
│   │   ├── compaction.ts        # Context compaction
│   │   ├── agent.ts             # Base agent class
│   │   ├── ba-agent.ts          # BA agent definition
│   │   └── sysadmin-agent.ts    # SysAdmin agent definition
│   ├── config/
│   │   ├── schema.ts            # Zod v4 schema
│   │   ├── defaults.ts          # Default config values
│   │   └── index.ts             # Config loader
│   ├── tools/
│   │   ├── tool.ts              # Tool type definitions
│   │   ├── registry.ts          # Tool registry and lazy loading
│   │   ├── builtins/            # read, write, edit, bash, glob, grep, webfetch, websearch
│   │   ├── ba/                  # document, spreadsheet, diagram, template, dataAnalysis, sql
│   │   └── sysadmin/            # ssh, scriptGen, docker, k8s, terraform, network
│   ├── bus/
│   │   └── event-bus.ts         # Global event bus
│   ├── storage/
│   │   ├── index.ts             # SQLite storage init
│   │   └── messages.ts          # Session CRUD
│   └── cli/
│       ├── tui/App.tsx           # Ink + React TUI
│       └── server/Server.ts     # HTTP/SSE server
├── tests/
│   ├── permissions.test.ts
│   ├── edit.test.ts
│   ├── config.test.ts
│   ├── agent.test.ts
│   └── tools.test.ts
├── .baclirc.json                # Project config (optional)
├── .gitignore
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── install.sh                   # curl | bash installer
```

### Testing

```bash
npm test
```

Runs vitest across 5 test files with 64+ tests covering permissions, edit strategies, config validation, agent loop, and all 20+ tools.

### Adding a new tool

1. Create `src/tools/<category>/<name>.ts` exporting a `ToolDef` as default
2. Add it to `src/tools/registry.ts` (lazy-load module + agent tool list)
3. Update system prompts in `src/agent/loop.ts` if needed
4. Write tests in `tests/`

---

## Distribution

bacli is distributed as a private package via npm:

```bash
npm install -g @bacli/cli
```

The `install.sh` script tries npm first, then falls back to downloading a binary from GitHub releases. No watermarks, no telemetry, no tracking.

### Privacy

- All AI requests go directly to your configured provider
- No data is sent to any bacli-controlled server
- Sessions are stored locally in SQLite
- No analytics, no telemetry, no phone-home

---

## License

Private — all rights reserved.
