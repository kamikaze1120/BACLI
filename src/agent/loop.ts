import { streamText, wrapLanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { BacliConfig } from "../config/schema.js";
import type { GlobalBus, UserInputEvent } from "../bus/event-bus.js";
import type { Storage } from "../storage/index.js";
import { createMessage, createPart, finishMessage, getMessages, getSessionTotalTokens, forkSession, getSessionMessagesCount, updateSessionTitle } from "../storage/messages.js";
import { resolveTools } from "../tools/registry.js";
import { createToolContext, type ToolDef } from "../tools/tool.js";
import { evaluatePermission } from "./permissions.js";
import { ulid } from "ulid";

const LLM_TIMEOUT_MS = 60000;

export interface LoopInput {
  config: BacliConfig;
  bus: GlobalBus;
  storage: Storage;
  sessionID: string;
  initialPrompt: string;
  agent: string;
  mode?: "build" | "plan";
  abortController: AbortController;
}

export async function runLoop(input: LoopInput): Promise<void> {
  const { config, bus, storage, sessionID, initialPrompt, agent } = input;
  const mode = input.mode ?? "build";
  const abortController = input.abortController;
  let step = 0;

  const userMsgID = createMessage(storage, sessionID, "user");
  createPart(storage, userMsgID, "text", { text: initialPrompt });
  bus.emit("session", { sessionID, type: "updated", agent });

  while (true) {
    step++;
    bus.emit("log", { level: "DEBUG", message: `Loop step ${step}`, timestamp: Date.now() });

    const msgs = getMessages(storage, sessionID);

    // Only check break on step > 1 — step 1 always runs so new prompts get processed
    if (step > 1) {
      const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
      const hasToolCalls = lastAssistant?.parts?.some(
        (p) => p.type === "tool-call" && p.status !== "completed" && p.status !== "error"
      );
      if (lastAssistant?.finish_reason && lastAssistant.finish_reason !== "tool-calls" && !hasToolCalls) {
        break;
      }
    }

    if (step === 1) {
      generateTitle(config, sessionID, initialPrompt, storage).catch(() => {});
    }

    const tools = await resolveTools(agent, config.model, config);
    const aiTools = convertToolsToAISDK(tools, {
      sessionID, config, bus, agent, storage,
    });

    const system = buildSystemPrompt(agent, config, mode);
    const modelMessages = convertToModelMessages(msgs, msgs.length > 1);
    const assistantMsgID = createMessage(storage, sessionID, "assistant");

    const provider = createProvider(config);
    const model = wrapLanguageModel({
      model: provider(config.model),
      middleware: [],
    });

    try {
      // Apply timeout to LLM call
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, LLM_TIMEOUT_MS);

      const result = streamText({
        model,
        system,
        messages: modelMessages as any,
        tools: mode === "plan" ? undefined : aiTools as any,
        toolChoice: mode === "plan" ? "none" as any : "auto" as any,
        abortSignal: abortController.signal,
      });

      let fullText = "";
      const toolCallPromises: Promise<void>[] = [];
      let finishReason: string = "stop";

      for await (const rawPart of result.fullStream) {
        const part = rawPart as any;

        if (part.type === "text-delta") {
          fullText += part.textDelta || part.text || "";
          bus.emit("text:delta", { messageID: assistantMsgID, delta: part.textDelta || part.text || "", finished: false });
        } else if (part.type === "tool-call") {
          if (mode === "plan") continue;

          const toolID = part.toolName;
          const toolDef = tools[toolID];

          if (toolDef) {
            const callID = ulid();
            const partID = createPart(storage, assistantMsgID, "tool-call", { tool: toolID, args: part.input || part.args }, callID);

            bus.emit("tool:status", {
              callID,
              status: "running",
              tool: toolID,
              title: toolDef.description,
              timestamp: Date.now(),
            });

            const promise = executeTool(toolDef, {
              sessionID,
              messageID: assistantMsgID,
              agent,
              callID,
              config,
              bus,
              storage,
              abort: abortController.signal,
              args: part.input || part.args || {},
              partID,
            });
            toolCallPromises.push(promise);
          }
        } else if (part.type === "step-finish") {
          finishReason = part.finishReason ?? "stop";
        } else if (part.type === "error") {
          const err = part.error || new Error("Unknown AI error");
          bus.emit("error", err);
          finishReason = "error";
          if (mode === "plan") {
            fullText += `\n[Error] ${err.message}`;
          }
        }
      }

      clearTimeout(timeoutId);

      await Promise.all(toolCallPromises);

      if (fullText) {
        createPart(storage, assistantMsgID, "text", { text: fullText });
        bus.emit("text:delta", { messageID: assistantMsgID, delta: "", finished: true });
      }

      const usage = (result as any).usage;
      finishMessage(storage, assistantMsgID, finishReason, usage?.totalTokens ?? 0);

      // In plan mode, break after one step — user confirms before building
      if (mode === "plan") break;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      bus.emit("error", error);
      finishMessage(storage, assistantMsgID, "error", 0);
      throw error;
    }

    storage.prepare(`UPDATE sessions SET updated_at = datetime('now') WHERE id = ?`).run(sessionID);
  }
}

const MODEL_CONTEXT_LIMIT = 131072;

async function compactIfNeeded(config: BacliConfig, bus: GlobalBus, storage: Storage, sessionID: string, agent: string): Promise<string> {
  const totalTokens = getSessionTotalTokens(storage, sessionID);
  const pct = totalTokens / MODEL_CONTEXT_LIMIT;

  if (pct < 0.80) return sessionID;

  const msgCount = getSessionMessagesCount(storage, sessionID);

  // Fork the session
  const newID = forkSession(storage, sessionID);
  const summary = `Auto-compacted at ${Math.round(pct * 100)}% token usage (${msgCount} messages, ${totalTokens.toLocaleString()} tokens). Session forked.`;

  const summaryMsgID = createMessage(storage, newID, "assistant");
  createPart(storage, summaryMsgID, "text", { text: summary });
  finishMessage(storage, summaryMsgID, "stop", 0);

  bus.emit("session", { sessionID: newID, type: "created", agent, title: `${agent} (compacted)` });
  bus.emit("log", { level: "INFO", message: summary, timestamp: Date.now() });

  return newID;
}

export async function runPersistentLoop(input: Omit<LoopInput, "initialPrompt"> & { initialPrompt?: string }): Promise<void> {
  const { config, bus, storage, sessionID, agent } = input;
  let currentSessionID = sessionID;
  let currentMode = input.mode ?? "build";
  let currentAbort = new AbortController();

  const processPrompt = async (prompt: string): Promise<void> => {
    currentAbort = new AbortController();

    const loopInput: LoopInput = {
      config,
      bus,
      storage,
      sessionID: currentSessionID,
      initialPrompt: prompt,
      agent,
      mode: currentMode,
      abortController: currentAbort,
    };

    await runLoop(loopInput);
  };

  // Listen for input at all times — lets us abort a running prompt
  let inputResolver: ((prompt: string | null) => void) | null = null;

  const unsubInput = bus.on("user:input", (data: UserInputEvent) => {
    if (data.sessionID !== currentSessionID) return;
    if (inputResolver) {
      inputResolver(data.prompt);
      inputResolver = null;
    } else {
      // We're busy — abort current run
      currentAbort.abort();
    }
  });

  const waitForInput = (): Promise<string | null> => {
    return new Promise((resolve) => {
      inputResolver = resolve;
    });
  };

  try {
    if (input.initialPrompt) {
      bus.emit("agent:status", { status: "busy", sessionID: currentSessionID });
      const initial = input.initialPrompt;
      const prevID = currentSessionID;
      await processPrompt(initial).catch((err) => {
        bus.emit("agent:status", { status: "error", message: err.message, sessionID: currentSessionID });
      });
      const newID = await compactIfNeeded(config, bus, storage, prevID, agent);
      if (newID !== prevID) {
        currentSessionID = newID;
        bus.emit("session", { sessionID: newID, type: "switched", agent });
      }
    }

    while (true) {
      bus.emit("agent:status", { status: "awaiting-input", sessionID: currentSessionID });

      const nextInput = await waitForInput();
      if (nextInput == null || nextInput === "") break;

      const cmd = nextInput.trim().toLowerCase();
      if (cmd === "/exit" || cmd === "/quit") break;
      if (cmd === "/plan") { currentMode = "plan"; continue; }
      if (cmd === "/build") { currentMode = "build"; continue; }

      bus.emit("agent:status", { status: "busy", sessionID: currentSessionID });

      const prevSessionID = currentSessionID;
      await processPrompt(nextInput).catch((err) => {
        bus.emit("agent:status", { status: "error", message: err.message, sessionID: currentSessionID });
      });

      // Auto-compact after each response if > 80% context used
      const newID = await compactIfNeeded(config, bus, storage, prevSessionID, agent);
      if (newID !== prevSessionID) {
        currentSessionID = newID;
        bus.emit("agent:status", { status: "awaiting-input", sessionID: newID });
        bus.emit("session", { sessionID: newID, type: "switched", agent });
      }
    }
  } finally {
    unsubInput();
  }
}

async function executeTool(
  toolDef: ToolDef,
  ctx: {
    sessionID: string;
    messageID: string;
    agent: string;
    callID: string;
    config: BacliConfig;
    bus: GlobalBus;
    storage: Storage;
    abort: AbortSignal;
    args: unknown;
    partID: string;
  }
): Promise<void> {
  const toolCtx = createToolContext({
    sessionID: ctx.sessionID,
    messageID: ctx.messageID,
    agent: ctx.agent,
    callID: ctx.callID,
    config: ctx.config,
    bus: ctx.bus,
    abort: ctx.abort,
  });

  try {
    const parsedArgs = toolDef.parameters.parse(ctx.args);
    const result = await toolDef.execute(parsedArgs, toolCtx);

    ctx.storage.prepare(
      `UPDATE message_parts SET status = 'completed', data = ? WHERE id = ?`
    ).run(JSON.stringify({ output: result.output, metadata: result.metadata }), ctx.partID);

    const resultPartID = ulid();
    ctx.storage.prepare(
      `INSERT INTO message_parts (id, message_id, type, data, status, call_id) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(resultPartID, ctx.messageID, "tool-result", JSON.stringify({
      tool: toolDef.id,
      input: parsedArgs,
      output: result.output,
    }), "completed", ctx.callID);

    ctx.bus.emit("tool:status", {
      callID: ctx.callID,
      status: "completed",
      tool: toolDef.id,
      title: result.title,
      output: result.output,
      timestamp: Date.now(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    ctx.storage.prepare(
      `UPDATE message_parts SET status = 'error', data = ? WHERE id = ?`
    ).run(JSON.stringify({ error: errorMsg }), ctx.partID);

    ctx.storage.prepare(
      `INSERT INTO message_parts (id, message_id, type, data, status, call_id) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(ulid(), ctx.messageID, "tool-result", JSON.stringify({
      tool: toolDef.id,
      error: errorMsg,
    }), "error", ctx.callID);

    ctx.bus.emit("tool:status", {
      callID: ctx.callID,
      status: "error",
      tool: toolDef.id,
      error: errorMsg,
      timestamp: Date.now(),
    });
  }
}

function convertToModelMessages(msgs: ReturnType<typeof getMessages>, hasHistory: boolean): any[] {
  const result: any[] = [];

  for (const msg of msgs) {
    if (msg.role === "system") continue;

    const parts: any[] = [];
    for (const part of msg.parts) {
      switch (part.type) {
        case "text": {
          const data = JSON.parse(part.data);
          parts.push({ type: "text", text: data.text ?? "" });
          break;
        }
        case "tool-result": {
          const data = JSON.parse(part.data);
          parts.push({
            type: "tool-result",
            toolCallId: part.call_id ?? part.id,
            toolName: data.tool ?? "",
            result: data.output ?? data.error ?? "",
          });
          break;
        }
      }
    }

    if (parts.length === 0) continue;

    let content: any = parts;
    if (hasHistory && msg.role === "user") {
      const textParts = parts.filter((p: any) => p.type === "text");
      if (textParts.length > 0) {
        content = `<system-reminder>${textParts.map((p: any) => p.text).join("")}</system-reminder>`;
      }
    }

    result.push({ role: msg.role, content });
  }

  return result;
}

function convertToolsToAISDK(
  tools: Record<string, ToolDef>,
  ctx: {
    sessionID: string;
    config: BacliConfig;
    bus: GlobalBus;
    agent: string;
    storage: Storage;
  }
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [id, toolDef] of Object.entries(tools)) {
    result[id] = {
      description: toolDef.description,
      parameters: toolDef.parameters,
      execute: async (args: any) => {
        const callID = ulid();
        const toolCtx = createToolContext({
          sessionID: ctx.sessionID,
          messageID: "",
          agent: ctx.agent,
          callID,
          config: ctx.config,
          bus: ctx.bus,
          abort: new AbortController().signal,
        });

        const parsedArgs = toolDef.parameters.parse(args);
        const execResult = await toolDef.execute(parsedArgs, toolCtx);
        return execResult.output;
      },
    };
  }

  return result;
}

function createProvider(config: BacliConfig) {
  return createOpenAICompatible({
    name: "nvidia",
    baseURL: config.baseUrl || "https://integrate.api.nvidia.com/v1",
    apiKey: config.apiKey,
  });
}

function buildSystemPrompt(agent: string, config: BacliConfig, mode: string): string {
  const agentDesc = agent === "ba" ? BA_SYSTEM_PROMPT : SYSADMIN_SYSTEM_PROMPT;
  const additional = agent === "ba" ? BA_ADDITIONAL_PROMPT : SYSADMIN_ADDITIONAL_PROMPT;

  const modeInstr = mode === "plan"
    ? "\n\nYou are in PLAN mode. Explain your approach step by step. Do NOT execute any tools. The user will review your plan and switch to BUILD mode to proceed."
    : "\n\nYou are in BUILD mode. Execute tools and generate outputs directly. Do not ask for permission unless the tool's permission level requires it.";

  return [
    agentDesc,
    modeInstr,
    "",
    `<env>
  Working directory: ${process.cwd()}
  Platform: ${process.platform}
  Today's date: ${new Date().toDateString()}
  Shell: ${config.shell}
</env>`,
    additional,
  ].join("\n");
}

const BA_SYSTEM_PROMPT = `You are bacli BA Agent, an AI assistant specialized for Business Analysts.

Your role is to help BAs with:
- Creating requirements documents (BRD, FRD, PRD)
- Writing user stories and acceptance criteria
- Generating reports and status documents
- Data analysis using SQL, spreadsheets
- Creating process flow diagrams and charts
- Stakeholder communication templates

When generating documents, NEVER add watermarks, branding, attribution marks, or any identifying marks.

You have persistent memory stored in a Markdown file. Read it at the start of each session to remember user preferences and project context. Update it whenever you learn important information the user wants retained across sessions.
- Project memory: .bacli/memory.md (relative to working directory)
- Global memory: ~/.config/bacli/memory.md`;

const BA_ADDITIONAL_PROMPT = `
Available tools:
- document: Generate DOCX/PDF documents from templates
- spreadsheet: Create Excel workbooks with data
- diagram: Generate Mermaid diagrams (flowcharts, ERDs, sequence diagrams)
- template: Load and fill document templates
- dataAnalysis: Analyze CSV/JSON data and produce insights
- sql: Generate and analyze SQL queries
- bash: Execute shell commands (ask on sensitive operations)
- read/write/edit: File operations
- glob/grep: Search files
- webfetch/websearch: Research`;

const SYSADMIN_SYSTEM_PROMPT = `You are bacli SysAdmin Agent, an AI assistant specialized for System Administrators.

Your role is to help SysAdmins with:
- Generating shell scripts (Bash, PowerShell)
- Creating Docker/Docker Compose configurations
- Generating Kubernetes manifests
- Writing Terraform configurations
- Creating Ansible playbooks
- Network diagnostics and configuration
- Infrastructure analysis and documentation

You have persistent memory stored in a Markdown file. Read it at the start of each session to remember user preferences and project context. Update it whenever you learn important information the user wants retained across sessions.
- Project memory: .bacli/memory.md (relative to working directory)
- Global memory: ~/.config/bacli/memory.md`;

const SYSADMIN_ADDITIONAL_PROMPT = `
Available tools:
- ssh: Execute commands on remote systems over SSH (requires permission)
- scriptGen: Generate Bash/PowerShell scripts with explanation
- docker: Create Dockerfile and docker-compose.yml
- k8s: Generate Kubernetes manifest files
- terraform: Create Terraform configuration files
- network: Network diagnostics and configuration generation
- bash: Execute shell commands
- read/write/edit: File operations
- glob/grep: Search files
- webfetch/websearch: Research`;

async function generateTitle(config: BacliConfig, sessionID: string, prompt: string, storage: Storage): Promise<void> {
  try {
    const provider = createProvider(config);
    const model = wrapLanguageModel({ model: provider(config.smallModel || config.model), middleware: [] });
    const result = streamText({
      model,
      system: "Generate a short title (max 6 words) for this session. Return only the title, nothing else.",
      messages: [{ role: "user", content: `Session starting with: ${prompt.slice(0, 200)}` }],
    });

    let title = "";
    for await (const part of result.textStream) {
      title += part;
    }
    updateSessionTitle(storage, sessionID, title.trim());
  } catch {
    // Silently fail
  }
}
