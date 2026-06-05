# bacli

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![TypeScript](https://img.shields.io/badge/types-TypeScript-blue)](tsconfig.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)
[![Maintained](https://img.shields.io/badge/maintained-yes-green)](#)

> **CLI agent for Business Analysts & System Administrators** — documents, diagrams, infrastructure, scripts — all from your terminal.

```
  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║   ██████   █████  ██████  ██      ██                     ║
  ║  ██       ██   ██ ██   ██ ██      ██                     ║
  ║  ██       ███████ ██████  ██      ██                     ║
  ║  ██       ██   ██ ██   ██ ██      ██                     ║
  ║   ██████  ██   ██ ██████  ███████ ███████                ║
  ║                                                          ║
  ║  ┌──────────────────────────────────────────────────┐    ║
  ║  │  BA Agent    │  SysAdmin Agent   │  HTTP Server  │    ║
  ║  │  Documents   │  Docker/K8s       │  SSE Streaming│    ║
  ║  │  Diagrams    │  Terraform        │  Session API  │    ║
  ║  │  Data Analysis│ Scripts (any lang)│  Fork/Resume │    ║
  ║  └──────────────────────────────────────────────────┘    ║
  ║                                                          ║
  ║  ★ No watermarks ★ No telemetry ★ Open source (MIT) ★  ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
```

---

## ✨ What's this?

**bacli** is an AI agent that lives in your terminal. Tell it what you need and it gets to work — generating polished business documents, crunching CSV data, spinning up Docker Compose files, analyzing SQL queries, or writing Terraform configs.

Two agents, one tool:

| 🎯 **BA Agent** | ⚡ **SysAdmin Agent** |
|---|---|
| BRDs, FRDs, User Stories | Docker Compose, Dockerfiles |
| Mermaid diagrams (flowcharts, ERDs, sequences) | Kubernetes manifests |
| DOCX, PDF, Markdown docs | Terraform (AWS, GCP, Azure) |
| Excel spreadsheets | Bash, PowerShell, Python, Batch scripts |
| CSV/JSON data analysis | SSH remote execution |
| SQL query analysis & optimization | Network diagnostics & configs |
| Handlebars templates | Infrastructure blueprints |

No watermarks. No branding. Just clean, professional output.

---

## 🚀 Quick start

**Mac / Linux (bash):**
```bash
curl -fsSL https://raw.githubusercontent.com/kamikaze1120/BACLI/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/kamikaze1120/BACLI/main/install.ps1 | iex
```

Then start the agent:

```bash
bacli
```

That's it. No API keys, no setup, no accounts — just install and play.

```bash
# Or jump straight in with a prompt
bacli "Create a BRD for a customer portal with stakeholder analysis"
bacli sysadmin "Set up Docker Compose for a Node.js + PostgreSQL app"
```

### Manual install (any platform)

```bash
git clone https://github.com/kamikaze1120/BACLI.git
cd BACLI
npm install
npm run build
npm link     # makes `bacli` available globally
```

---

## 🎮 TUI in action

```
┌─────────────────────────────────────────────────────────────┐
│  bacli — BA Agent                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  > Create a BRD for an inventory management system          │
│                                                             │
│  ┌─ Generating document ──────────────────────────┐         │
│  │  ✓ Creating Business Requirements Document      │        │
│  │  ✓ Adding stakeholders section                  │        │
│  │  ✓ Generating functional requirements           │        │
│  │  ✓ Saving to output/brd-inventory.docx          │        │
│  └─────────────────────────────────────────────────┘        │
│                                                             │
│  Here's your BRD! It covers:                                │
│  • Executive summary                                        │
│  • Stakeholder analysis (6 identified)                      │
│  • 15 functional requirements across 4 modules              │
│  • Timeline and milestones                                  │
│                                                             │
│  >                                                          │
├─────────────────────────────────────────────────────────────┤
│  [BA] [SysAdmin]  Ctrl+P sessions  Ctrl+C cancel            │
└─────────────────────────────────────────────────────────────┘
```

### Keyboard shortcuts

| Key | What it does |
|---|---|
| `Tab` | Switch between BA and SysAdmin agents |
| `Ctrl+P` | Browse and switch sessions |
| `Ctrl+C` | Stop current generation |
| `Ctrl+C` `Ctrl+C` | Exit bacli |
| `Esc` | Close session picker |

---

## ⚙️ Configuration

Configuration is loaded in this order (later wins):

1. **Default** (built-in — works out of the box)
2. **Global**: `~/.config/bacli/config.json`
3. **Project**: `.baclirc.json`
4. **Env vars**: `BACLI_MODEL`, `BACLI_PROVIDER`, `BACLI_BASE_URL`
5. **CLI flags**: `--model`, `--provider`

You don't need to configure anything to get started. To create a project-level override:

```bash
bacli init
```

### Full example

```json
{
  "$schema": "https://bacli.dev/config.json",
  "model": "deepseek-ai/deepseek-v4-flash",
  "provider": "nvidia",
  "baseUrl": "https://integrate.api.nvidia.com/v1",
  "shell": "powershell",
  "logLevel": "INFO",
  "agent": {
    "ba": {
      "permission": { "edit": "allow", "bash": "ask", "read": "allow" }
    },
    "sysadmin": {
      "permission": { "edit": "allow", "bash": "allow", "ssh": "ask" }
    }
  },
  "permission": {
    "read": { "*.env": "ask", "*.env.*": "ask" }
  },
  "compaction": {
    "auto": true,
    "tailTurns": 15
  }
}
```

---

## 🧠 Memory system

bacli remembers what you tell it — across sessions.

- **Project memory**: `.bacli/memory.md`
- **Global memory**: `~/.config/bacli/memory.md`

The agent reads these on launch and writes to them throughout the conversation. You can edit them manually too:

```bash
# See what it remembers
cat ~/.config/bacli/memory.md

# Add something it should definitely know
echo "- Prefer Markdown over DOCX for drafts" >> .bacli/memory.md
```

---

## 📋 All commands

```
Usage: bacli [options] [prompt]

CLI agent for Business Analysts and System Administrators

Arguments:
  prompt                 Initial prompt for the BA agent

Options:
  -V, --version          Output version number
  -m, --model <model>    Model ID to use
  -p, --provider <prov>  Provider name
  -h, --help             Display help

Commands:
  sysadmin [prompt]      Start SysAdmin agent
  init                   Create .baclirc.json
  serve [options]        Start HTTP + SSE server
```

---

## 🛠️ Tool reference

### Built-in tools (both agents)

| Tool | What it does |
|---|---|
| `bash` | Run shell commands (respects permissions) |
| `read` | Read files (offset/limit support) |
| `write` | Write files |
| `edit` | Edit files — 9 matching strategies |
| `glob` | Find files by glob pattern |
| `grep` | Search file contents by regex |
| `webfetch` | Fetch URLs and convert to markdown |
| `websearch` | Search the web |

### BA tools

| Tool | What it does |
|---|---|
| `document` | Generate DOCX, PDF, Markdown — **zero watermarks** |
| `spreadsheet` | Create Excel workbooks with data |
| `diagram` | Mermaid diagrams (flowchart, ERD, sequence, class, Gantt) |
| `template` | Fill Handlebars templates (BRD, FRD, User Story) |
| `dataAnalysis` | Analyze CSV/JSON data with stats |
| `sql` | Analyze SQL queries, get optimization tips |

### SysAdmin tools

| Tool | What it does |
|---|---|
| `ssh` | Remote command execution over SSH |
| `scriptGen` | Generate Bash, PowerShell, Python, Batch |
| `docker` | Dockerfile + Docker Compose |
| `k8s` | Kubernetes manifests (Deployment, Service, ConfigMap, etc.) |
| `terraform` | Terraform configs for any provider |
| `network` | Network diagnostics and config generation |

---

## 🔒 Permission system

Three levels per tool:

| Rule | What happens |
|---|---|
| `allow` | Runs automatically |
| `ask` | Prompts you before each run |
| `deny` | Blocked with an error |

Rules use glob patterns and per-agent overrides:

```json
{
  "permission": {
    "read": { "*.env": "ask", "*.key": "deny" },
    "bash": "ask"
  },
  "agent": {
    "ba": { "permission": { "bash": "ask" } },
    "sysadmin": { "permission": { "bash": "allow", "ssh": "ask" } }
  }
}
```

---

## 🏗️ Architecture

```
┌───────────────────────────────────────────────────────┐
│                       bacli CLI                       │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐  ┌───────┐   │
│  │ TUI      │  │ HTTP     │  │ CLI     │  │Config │   │
│  │Ink+React)│  │ Server   │  │Commander│  │Zod    │   │
│  └────┬─────┘  └────┬─────┘  └────┬────┘  └───┬───┘   │
│       └─────────────┴─────────────┴───────────┘       │
│                         │                             │
│  ┌──────────────────────┴────────────────────────┐    │
│  │               Agent Loop                      │    │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐   │    │
│  │  │ Provider │  │ Tools    │  │ Permission │   │    │
│  │  │ (AI SDK) │  │ (20+)    │  │ System     │   │    │
│  │  └──────────┘  └──────────┘  └────────────┘   │    │
│  └───────────────────────────────────────────────┘    │
│                         │                             │
│  ┌──────────────────────┴────────────────────────┐    │
│  │            Storage (SQLite)                   │    │
│  │  sessions │ messages │ parts │ compaction     │    │
│  └───────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────┘
```

### Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+, TypeScript 5.x |
| AI SDK | Vercel AI SDK v6 |
| TUI | Ink + React 18 |
| Validation | Zod v4 |
| Storage | SQLite (better-sqlite3) |
| Config | cosmiconfig |
| Documents | docx, pdf-lib (MIT) — **no watermarks** |
| Diagrams | Mermaid |
| Spreadsheets | ExcelJS |

---

## 🧪 Development

```bash
git clone https://github.com/kamikaze1120/BACLI.git
cd BACLI
npm install
npm run build
npm link     # makes `bacli` available globally
```

### Scripts

| Command | What it does |
|---|---|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled version |
| `npm run dev` | Run with tsx (hot reload) |
| `npm test` | 64+ tests across 5 suites |
| `npm run test:watch` | Tests in watch mode |
| `npm run binary` | Package as standalone binary (pkg) |

### Project structure

```
bacli/
├── src/
│   ├── index.ts               # Entry point
│   ├── agent/
│   │   ├── loop.ts             # Core agent loop
│   │   ├── permissions.ts      # Permission evaluator
│   │   ├── compaction.ts       # Context pruning
│   │   ├── agent.ts            # Base agent
│   │   ├── ba-agent.ts         # BA agent
│   │   └── sysadmin-agent.ts   # SysAdmin agent
│   ├── config/
│   │   ├── schema.ts           # Zod v4 schema
│   │   ├── defaults.ts         # Default config
│   │   └── index.ts            # Config loader
│   ├── tools/
│   │   ├── tool.ts             # Tool types
│   │   ├── registry.ts         # Lazy-load registry
│   │   ├── builtins/           # read, write, edit, bash, glob, grep, webfetch, websearch
│   │   ├── ba/                  # document, spreadsheet, diagram, template, dataAnalysis, sql
│   │   └── sysadmin/            # ssh, scriptGen, docker, k8s, terraform, network
│   ├── bus/event-bus.ts        # Global event bus
│   ├── storage/
│   │   ├── index.ts            # SQLite init
│   │   └── messages.ts         # Session CRUD
│   └── cli/
│       ├── tui/App.tsx          # Ink + React TUI
│       └── server/Server.ts    # HTTP/SSE server
├── tests/                       # 64+ tests
├── install.sh                   # curl | bash installer
├── LICENSE                      # MIT
└── package.json
```

---

## 🤝 Contributing

PRs welcome! Keep it simple:

1. Fork the repo
2. Create a feature branch
3. Write tests
4. Run `npm test` — all green
5. Open a PR

---

## 🔒 Privacy

- **Zero telemetry.** No analytics, no tracking, no phone-home
- **Zero watermarks.** Every document is clean
- **Your data stays local.** Sessions stored in SQLite on your machine
- **Direct to provider.** AI requests go straight to your configured provider, not through any bacli proxy

---

## 🗑️ Uninstall

**Mac / Linux:**
```bash
npm uninstall -g @bacli/cli
rm -rf ~/.bacli ~/.config/bacli
```

**Windows (PowerShell):**
```powershell
npm uninstall -g @bacli/cli
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\bacli", "$env:USERPROFILE\.config\bacli"
```

What this removes:
| Path | Contents |
|---|---|
| `~/.bacli/src` (or `%LOCALAPPDATA%\bacli`) | Installed source code |
| `~/.config/bacli` | Config, sessions (SQLite), memory, auth |
| `npm global symlink` | The `bacli` command |

To also clean up local project data:
```bash
rm -rf .bacli                                   # Mac/Linux
Remove-Item -Recurse -Force ".bacli"             # Windows PowerShell
```

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  Built with 🔥 for BAs and SysAdmins who work in the terminal.
  <br>
  <a href="https://github.com/kamikaze1120/BACLI">GitHub</a>
</p>
