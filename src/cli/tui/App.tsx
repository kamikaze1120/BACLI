import React, { useState, useCallback, useEffect, useRef } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { GlobalBus, type ToolStatusEvent, type TextDeltaEvent, type AgentStatusEvent } from "../../bus/event-bus.js";
import { initStorage, type Storage } from "../../storage/index.js";
import { createSession, getSessionTotalTokens, getSessionMessagesCount, listSessions } from "../../storage/messages.js";
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
  status: string;
  title: string;
  output?: string;
}

interface SessionEntry {
  id: string;
  title: string;
  agent: string;
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

function getContextLimit(model: string): number {
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (model.includes(key) || key.includes(model)) return limit;
  }
  return 131072;
}

function getPricePerM(model: string): { input: number; output: number } {
  for (const [key, price] of Object.entries(MODEL_PRICES)) {
    if (model.includes(key) || key.includes(model)) return price;
  }
  return { input: 0.25, output: 1.00 };
}

function extractTodos(text: string): TodoItem[] {
  const items: TodoItem[] = [];
  const regex = /[-*]\s*\[([ xX])\]\s*(.+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    items.push({ text: match[2].trim(), done: match[1].toLowerCase() === "x" });
  }
  return items;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

function BacliApp({ initialAgent = "ba", initialPrompt }: { initialAgent?: "ba" | "sysadmin"; initialPrompt?: string }) {
  const { exit } = useApp();
  const [agent, setAgent] = useState<"ba" | "sysadmin">(initialAgent);
  const [mode, setMode] = useState<Mode>("build");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MessageDisplay[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [currentSessionID, setCurrentSessionID] = useState("");
  const [toolCalls, setToolCalls] = useState<Map<string, ToolCallDisplay>>(new Map());
  const [agentStatus, setAgentStatus] = useState<"busy" | "awaiting-input" | "error" | "starting">("starting");
  const [showSessions, setShowSessions] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [tokenStats, setTokenStats] = useState({ total: 0, limit: 131072, msgs: 0 });

  const configRef = useRef<any>(null);
  const storageRef = useRef<Storage | null>(null);
  const theme = defaultTheme;
  const sessionIdRef = useRef("");


  const updateStats = useCallback((sid: string) => {
    if (!storageRef.current || !sid) return;
    const limit = getContextLimit(configRef.current?.model || "");
    setTokenStats({
      total: getSessionTotalTokens(storageRef.current, sid),
      limit,
      msgs: getSessionMessagesCount(storageRef.current, sid),
    });
  }, []);

  const updateTodos = useCallback(() => {
    const all: TodoItem[] = [];
    for (const msg of messages) {
      if (msg.role === "assistant") {
        all.push(...extractTodos(msg.text));
      }
    }
    setTodoItems(all.slice(0, 20));
  }, [messages]);

  useEffect(() => { updateTodos(); }, [messages, updateTodos]);

  const submitRef = useRef<(prompt: string) => void>(() => {});

  useEffect(() => {
    (async () => {
      const config = await loadConfig();
      configRef.current = config;

      const storage = initStorage(config);
      storageRef.current = storage;

      const sessionID = createSession(storage, agent, config.model, config.provider);
      sessionIdRef.current = sessionID;
      setCurrentSessionID(sessionID);
      refreshSessions(storage);

      const bus = GlobalBus.getInstance();

      const unsubText = bus.on("text:delta", (data: TextDeltaEvent) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            if (data.finished) {
              updateStats(sessionIdRef.current);
              return updated;
            }
            updated[updated.length - 1] = { ...last, text: last.text + (data.delta || "") };
          }
          return updated;
        });
      });

      const unsubTool = bus.on("tool:status", (data: ToolStatusEvent) => {
        setToolCalls((prev) => {
          const next = new Map(prev);
          if (data.status === "completed" || data.status === "error") {
            next.delete(data.callID);
          } else {
            next.set(data.callID, {
              callID: data.callID,
              tool: data.tool,
              status: data.status,
              title: data.title || data.tool,
            });
          }
          return next;
        });
      });

      const unsubSession = bus.on("session", () => {
        if (storageRef.current) refreshSessions(storageRef.current);
      });

      const unsubAgent = bus.on("agent:status", (data: AgentStatusEvent) => {
        if (data.sessionID === sessionID) {
          setAgentStatus(data.status);
          if (data.status !== "busy") updateStats(sessionID);
        }
      });

      updateStats(sessionID);

      runPersistentLoop({
        config,
        bus,
        storage,
        sessionID,
        agent,
        initialPrompt: initialPrompt || undefined,
        mode,
        abortController: new AbortController(),
      }).catch(() => {});

      submitRef.current = (prompt: string) => {
        bus.emit("user:input", { prompt, sessionID });
      };

      return () => {
        unsubText();
        unsubTool();
        unsubSession();
        unsubAgent();
      };
    })();
  }, []);

  const refreshSessions = useCallback((storage: Storage) => {
    const list = listSessions(storage);
    setSessions(list.map((s) => ({ id: s.id, title: s.title || s.id.slice(0, 8), agent: s.agent })));
  }, []);

  const handleSubmit = useCallback((prompt: string) => {
    if (!prompt.trim()) return;

    const cmd = prompt.trim().toLowerCase();
    if (cmd === "/plan") { setMode("plan"); return; }
    if (cmd === "/build") { setMode("build"); return; }

    setInput("");
    setToolCalls(new Map());
    setMessages((prev) => [...prev, { role: "user", text: prompt }]);
    setMessages((prev) => [...prev, { role: "assistant", text: "" }]);
    submitRef.current(prompt);
  }, []);

  useInput((inputKey, key) => {
    if (key.ctrl && inputKey === "c") {
      GlobalBus.getInstance().emit("user:input", { prompt: "", sessionID: sessionIdRef.current });
      exit();
    }
    if (key.tab) {
      setAgent((prev) => prev === "ba" ? "sysadmin" : "ba");
    }
    if (key.ctrl && inputKey === "p") {
      setShowSessions((prev) => !prev);
    }
    if (key.ctrl && inputKey === "i") {
      setShowInfo((prev) => !prev);
      if (!showInfo) updateStats(sessionIdRef.current);
    }
  });

  const pct = tokenStats.limit > 0 ? ((tokenStats.total / tokenStats.limit) * 100).toFixed(1) : "0.0";
  const price = getPricePerM(configRef.current?.model || "");
  const estCost = ((tokenStats.total / 1000000) * (price.input + price.output) / 2).toFixed(4);
  const isBusy = agentStatus === "busy" || agentStatus === "starting";
  const statusDot = isBusy ? "●" : "○";
  const statusColor = isBusy ? "yellow" : theme.textMuted;

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text bold color={theme.accent}> bacli </Text>
        <Text color={statusColor}>{statusDot}</Text>
        <Text color={agent === "ba" ? theme.primary : theme.textMuted}> BA </Text>
        <Text color={theme.textMuted}>|</Text>
        <Text color={agent === "sysadmin" ? theme.primary : theme.textMuted}> SysAdmin </Text>
        <Text color={theme.textMuted}> / </Text>
        <Text bold color={mode === "build" ? theme.primary : theme.warning}>{mode.toUpperCase()}</Text>
        <Box flexGrow={1} />
        <Text color={theme.textMuted}>{configRef.current?.model || "no-model"}</Text>
      </Box>

      {/* Main */}
      <Box flexGrow={1} flexDirection="row">
        {/* Session sidebar */}
        {showSessions && (
          <Box width={24} borderStyle="single" borderColor={theme.border} flexDirection="column" paddingX={1}>
            <Text bold color={theme.accent}>Sessions</Text>
            <Box flexGrow={1} flexDirection="column">
              {sessions.length === 0 && <Text color={theme.textMuted}>no sessions</Text>}
              {sessions.map((s) => (
                <Text key={s.id} color={s.id === currentSessionID ? theme.primary : theme.textMuted} wrap="truncate-end">
                  {s.id === currentSessionID ? ">" : " "} {s.title || s.id.slice(0, 12)}
                </Text>
              ))}
            </Box>
          </Box>
        )}

        {/* Chat panel */}
        <Box flexGrow={1} flexDirection="column">
          {/* Messages */}
          <Box flexGrow={1} flexDirection="column" paddingX={1}>
            {messages.map((msg, i) => (
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
            ))}
            {Array.from(toolCalls.values()).map((tc) => (
              <Box key={tc.callID} flexDirection="row" marginY={0}>
                <Text color={theme.secondary}>  ● {tc.tool}: {tc.title}</Text>
              </Box>
            ))}
            {messages.length === 0 && agentStatus === "awaiting-input" && (
              <Box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
                <Text color={theme.textMuted}>Ask your {agent === "ba" ? "BA" : "SysAdmin"} agent anything</Text>
              </Box>
            )}
          </Box>

          {/* Input */}
          <Box borderStyle="single" borderColor={theme.border} paddingX={1} flexDirection="row">
            <Box width={2}>
              <Text color={isBusy ? theme.warning : theme.primary} bold>{mode === "build" ? ">" : "?"} </Text>
            </Box>
            <Box flexGrow={1}>
              <TextInput
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit as any}
                placeholder={isBusy ? "Waiting for agent..." : "Type your message..."}
              />
            </Box>
          </Box>
        </Box>

        {/* Info panel */}
        {showInfo && (
          <Box width={30} borderStyle="single" borderColor={theme.border} flexDirection="column" paddingX={1}>
            <Text bold color={theme.accent}>Context</Text>
            <Box marginY={0}>
              <Text color={theme.textMuted}>Tokens: </Text>
              <Text color={theme.text}>{tokenStats.total.toLocaleString()} / {(tokenStats.limit / 1000).toFixed(0)}K</Text>
            </Box>
            <Box marginY={0}>
              <Text color={theme.textMuted}>Used: </Text>
              <Text color={pct === "100.0" ? theme.error : theme.text}>{pct}%</Text>
            </Box>
            <Box marginY={0}>
              <Text color={theme.textMuted}>Messages: </Text>
              <Text color={theme.text}>{tokenStats.msgs}</Text>
            </Box>
            <Box marginY={0}>
              <Text color={theme.textMuted}>Est. cost: </Text>
              <Text color={theme.text}>${estCost}</Text>
            </Box>

            <Box width={26} height={1} marginY={1}>
              <Text>{renderBar(parseFloat(pct), 26)}</Text>
            </Box>

            {todoItems.length > 0 && (
              <>
                <Text bold color={theme.accent}>Tasks</Text>
                <Box flexDirection="column">
                  {todoItems.slice(0, 10).map((item, i) => (
                    <Box key={i} flexDirection="row">
                      <Text color={item.done ? theme.success : theme.warning}>
                        {item.done ? "✓" : "○"}
                      </Text>
                      <Text color={theme.text}>{truncate(item.text, 22)}</Text>
                    </Box>
                  ))}
                  {todoItems.length > 10 && (
                    <Text color={theme.textMuted}>  +{todoItems.length - 10} more</Text>
                  )}
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>

      {/* Status bar */}
      <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.textMuted}>
          [Tab: Agent] [/plan /build]
        </Text>
        <Box flexGrow={1} />
        <Text color={theme.textMuted}>session: {currentSessionID.slice(0, 8)}</Text>
        <Box width={1} />
        <Text color={statusColor}>· {agentStatus}</Text>
      </Box>
    </Box>
  );
}

function renderBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  const barColor = pct > 80 ? "\x1b[31m" : pct > 50 ? "\x1b[33m" : "\x1b[32m";
  return barColor + "█".repeat(Math.max(0, filled)) + "\x1b[90m░".repeat(Math.max(0, empty)) + "\x1b[0m";
}

export async function renderTUI(agent: "ba" | "sysadmin", initialPrompt?: string): Promise<void> {
  const { waitUntilExit } = render(React.createElement(BacliApp, { initialAgent: agent, initialPrompt }));
  await waitUntilExit();
}
