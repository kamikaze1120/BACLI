import React, { useState, useCallback, useEffect, useRef } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { GlobalBus, type ToolStatusEvent, type TextDeltaEvent, type AgentStatusEvent } from "../../bus/event-bus.js";
import { initStorage, type Storage } from "../../storage/index.js";
import { createSession, getSessionTotalTokens, getSessionMessagesCount, listSessions, forkSession } from "../../storage/messages.js";
import { loadConfig } from "../../config/index.js";
import { runPersistentLoop } from "../../agent/loop.js";
import { defaultTheme } from "./Theme.js";

interface MessageDisplay {
  role: string;
  text: string;
}

interface ToolCallDisplay {
  callID: string;
  tool: string;
  title: string;
}

interface TodoItem {
  text: string;
  done: boolean;
}

type Mode = "build" | "plan";

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "deepseek-ai/deepseek-v4-flash": 131072,
};
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "deepseek-ai/deepseek-v4-flash": { input: 0.27, output: 1.10 },
};

function getContextLimit(m: string): number {
  for (const [k, v] of Object.entries(MODEL_CONTEXT_LIMITS))
    if (m.includes(k) || k.includes(m)) return v;
  return 131072;
}

function getPricePerM(m: string): { input: number; output: number } {
  for (const [k, v] of Object.entries(MODEL_PRICES))
    if (m.includes(k) || k.includes(m)) return v;
  return { input: 0.25, output: 1.00 };
}

function extractTodos(text: string): TodoItem[] {
  const items: TodoItem[] = [];
  const re = /[-*]\s*\[([ xX])\]\s*(.+)/g;
  let m;
  while ((m = re.exec(text)) !== null)
    items.push({ text: m[2].trim(), done: m[1].toLowerCase() === "x" });
  return items;
}

function BacliApp({ initialAgent = "ba", initialPrompt }: { initialAgent?: "ba" | "sysadmin"; initialPrompt?: string }) {
  const { exit } = useApp();
  const [agent, setAgent] = useState<"ba" | "sysadmin">(initialAgent);
  const [mode, setMode] = useState<Mode>("build");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MessageDisplay[]>([]);
  const [toolCalls, setToolCalls] = useState<Map<string, ToolCallDisplay>>(new Map());
  const [agentStatus, setAgentStatus] = useState<"busy" | "awaiting-input" | "error" | "starting">("starting");
  const [showSessions, setShowSessions] = useState(false);
  const [sessionList, setSessionList] = useState<{ id: string; title: string }[]>([]);
  const [currentSessionID, setCurrentSessionID] = useState("");
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [tokenStats, setTokenStats] = useState({ total: 0, limit: 131072, msgs: 0 });

  const cfg = useRef<any>(null);
  const stg = useRef<Storage | null>(null);
  const sid = useRef("");
  const theme = defaultTheme;
  const submit = useRef<(p: string) => void>(() => {});

  const refreshSessions = useCallback(() => {
    if (!stg.current) return;
    const list = listSessions(stg.current);
    setSessionList(list.map(s => ({ id: s.id, title: s.title || s.id.slice(0, 8) })));
  }, []);

  const updateStats = useCallback((id: string) => {
    if (!stg.current || !id) return;
    const limit = getContextLimit(cfg.current?.model || "");
    setTokenStats({
      total: getSessionTotalTokens(stg.current, id),
      limit,
      msgs: getSessionMessagesCount(stg.current, id),
    });
  }, []);

  const updateTodos = useCallback(() => {
    const all: TodoItem[] = [];
    for (const msg of messages)
      if (msg.role === "assistant")
        all.push(...extractTodos(msg.text));
    setTodoItems(all.slice(0, 20));
  }, [messages]);

  useEffect(() => { updateTodos(); }, [messages, updateTodos]);

  useEffect(() => {
    (async () => {
      const config = await loadConfig();
      cfg.current = config;
      const storage = initStorage(config);
      stg.current = storage;
      const sessionID = createSession(storage, agent, config.model, config.provider);
      sid.current = sessionID;
      setCurrentSessionID(sessionID);
      refreshSessions();

      const bus = GlobalBus.getInstance();

      const unsubText = bus.on("text:delta", (data: TextDeltaEvent) => {
        setMessages(prev => {
          const u = [...prev];
          const last = u[u.length - 1];
          if (last?.role === "assistant") {
            if (data.finished) { updateStats(sid.current); return u; }
            u[u.length - 1] = { ...last, text: last.text + (data.delta || "") };
          }
          return u;
        });
      });

      const unsubTool = bus.on("tool:status", (data: ToolStatusEvent) => {
        setToolCalls(prev => {
          const n = new Map(prev);
          if (data.status === "completed" || data.status === "error") n.delete(data.callID);
          else n.set(data.callID, { callID: data.callID, tool: data.tool, title: data.title || data.tool });
          return n;
        });
      });

      const unsubSession = bus.on("session", (data) => {
        refreshSessions();
        if (data.type === "switched" && data.sessionID) {
          sid.current = data.sessionID;
          setCurrentSessionID(data.sessionID);
          updateStats(data.sessionID);
          setMessages([]);
        }
      });

      const unsubAgent = bus.on("agent:status", (data: AgentStatusEvent) => {
        if (data.sessionID === sid.current) {
          setAgentStatus(data.status);
          if (data.status !== "busy") updateStats(sid.current);
        }
      });

      updateStats(sessionID);

      runPersistentLoop({
        config, bus, storage, sessionID, agent,
        initialPrompt: initialPrompt || undefined, mode,
        abortController: new AbortController(),
      }).catch(() => {});

      submit.current = (p: string) => bus.emit("user:input", { prompt: p, sessionID: sid.current });

      return () => { unsubText(); unsubTool(); unsubSession(); unsubAgent(); };
    })();
  }, []);

  const handleSubmit = useCallback((prompt: string) => {
    if (!prompt.trim()) return;
    const cmd = prompt.trim().toLowerCase();
    if (cmd === "/plan") { setMode("plan"); return; }
    if (cmd === "/build") { setMode("build"); return; }
    setInput("");
    setToolCalls(new Map());
    setMessages(prev => [...prev, { role: "user", text: prompt }, { role: "assistant", text: "" }]);
    submit.current(prompt);
  }, []);

  useInput((key, k) => {
    if (k.ctrl && key === "c") {
      GlobalBus.getInstance().emit("user:input", { prompt: "", sessionID: sid.current });
      exit();
    }
    if (k.tab) setAgent(prev => prev === "ba" ? "sysadmin" : "ba");
    if (k.ctrl && key === "p") setShowSessions(prev => !prev);
  });

  const isBusy = agentStatus === "busy" || agentStatus === "starting";
  const pct = tokenStats.limit > 0 ? ((tokenStats.total / tokenStats.limit) * 100).toFixed(1) : "0.0";
  const price = getPricePerM(cfg.current?.model || "");
  const estCost = ((tokenStats.total / 1000000) * (price.input + price.output) / 2).toFixed(4);

  return (
    <Box flexDirection="column" height="100%" borderStyle="round" borderColor={theme.border}>
      {/* Header */}
      <Box paddingX={1}>
        <Text bold color={theme.accent}> bacli </Text>
        <Text color={isBusy ? theme.warning : theme.textMuted}>{isBusy ? "●" : "○"}</Text>
        <Text color={theme.textMuted}> {agent === "ba" ? "BA" : "SysAdmin"} / <Text bold color={mode === "build" ? theme.primary : theme.warning}>{mode}</Text></Text>
        <Box flexGrow={1} />
        <Text color={theme.textMuted}>{cfg.current?.model || ""}</Text>
      </Box>

      <Text color={theme.border}>{"─".repeat(80)}</Text>

      {/* Main area */}
      <Box flexGrow={1} flexDirection="row">
        <Box flexGrow={1} flexDirection="column" paddingX={1}>
          {messages.length === 0 && agentStatus === "awaiting-input" ? (
            <Box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
              <Text color={theme.textMuted}>Ask your {agent === "ba" ? "BA" : "SysAdmin"} agent anything</Text>
            </Box>
          ) : (
            messages.map((msg, i) => (
              <Box key={i} flexDirection="column" marginY={0}>
                <Text color={msg.role === "user" ? theme.accent : theme.textMuted}>
                  {msg.role === "user" ? "You" : "BA"}
                </Text>
                {msg.text.startsWith("[Error]") ? (
                  <Text color={theme.error}>{msg.text}</Text>
                ) : (
                  <Text color={theme.text}>{msg.text || (msg.role === "assistant" ? "..." : "")}</Text>
                )}
              </Box>
            ))
          )}
          {Array.from(toolCalls.values()).map(tc => (
            <Box key={tc.callID} flexDirection="row" marginY={0}>
              <Text color={theme.secondary}>  ● {tc.tool}: {tc.title}</Text>
            </Box>
          ))}
        </Box>

        {/* Sidebar */}
        {showSessions ? (
          <Box width={24} flexDirection="column" paddingX={1}>
            <Text bold color={theme.accent}>Sessions</Text>
            {sessionList.map(s => (
              <Text key={s.id} color={s.id === currentSessionID ? theme.primary : theme.textMuted}>
                {s.id === currentSessionID ? ">" : " "} {s.title}
              </Text>
            ))}
          </Box>
        ) : (
          <Box width={24} flexDirection="column" paddingX={1}>
            <Text bold color={theme.accent}>Context</Text>
            <Text color={theme.textMuted}>Tokens <Text color={theme.text}>{tokenStats.total.toLocaleString()}</Text></Text>
            <Text color={theme.textMuted}>Used <Text color={pct === "100.0" ? theme.error : theme.text}>{pct}%</Text></Text>
            <Text color={theme.textMuted}>Cost <Text color={theme.text}>${estCost}</Text></Text>
            <Box height={1}>
              <Text>{renderBar(parseFloat(pct), 22)}</Text>
            </Box>
            {todoItems.length > 0 && (
              <>
                <Text bold color={theme.accent}>Tasks</Text>
                {todoItems.slice(0, 8).map((item, i) => (
                  <Text key={i}>
                    <Text color={item.done ? theme.success : theme.warning}>{item.done ? "✓" : "○"}</Text>
                    <Text color={theme.text}> {item.text.length > 18 ? item.text.slice(0, 17) + "…" : item.text}</Text>
                  </Text>
                ))}
                {todoItems.length > 8 && <Text color={theme.textMuted}>+{todoItems.length - 8} more</Text>}
              </>
            )}
          </Box>
        )}
      </Box>

      <Text color={theme.border}>{"─".repeat(80)}</Text>

      {/* Input */}
      <Box paddingX={1} flexDirection="row">
        <Box width={2}>
          <Text color={isBusy ? theme.warning : theme.primary} bold>{">"}</Text>
        </Box>
        <Box flexGrow={1}>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit as any}
            placeholder={isBusy ? "Waiting..." : "Type your message..."}
          />
        </Box>
      </Box>

      <Text color={theme.border}>{"─".repeat(80)}</Text>

      {/* Status */}
      <Box paddingX={1}>
        <Text color={theme.textMuted}>[Tab: Agent] [Ctrl+P: Sessions] [Ctrl+C: Exit]</Text>
        <Box flexGrow={1} />
        <Text color={theme.textMuted}>{currentSessionID.slice(0, 8)}</Text>
        <Box width={1} />
        <Text color={isBusy ? theme.warning : theme.textMuted}>· {agentStatus}</Text>
      </Box>
    </Box>
  );
}

function renderBar(pct: number, w: number): string {
  const f = Math.round((pct / 100) * w);
  const e = w - f;
  const c = pct > 80 ? "\x1b[31m" : pct > 50 ? "\x1b[33m" : "\x1b[32m";
  return c + "█".repeat(Math.max(0, f)) + "\x1b[90m░".repeat(Math.max(0, e)) + "\x1b[0m";
}

export async function renderTUI(agent: "ba" | "sysadmin", initialPrompt?: string): Promise<void> {
  const { waitUntilExit } = render(React.createElement(BacliApp, { initialAgent: agent, initialPrompt }));
  await waitUntilExit();
}
