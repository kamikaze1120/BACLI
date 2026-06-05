import React, { useState, useCallback, useEffect, useRef } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { GlobalBus, type ToolStatusEvent, type TextDeltaEvent } from "../../bus/event-bus.js";
import { initStorage, type Storage } from "../../storage/index.js";
import { createSession, getMessages, listSessions, type Message } from "../../storage/messages.js";
import { loadConfig } from "../../config/index.js";
import { runLoop } from "../../agent/loop.js";
import { defaultTheme, type ThemeColors } from "./Theme.js";

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

function BacliApp({ initialAgent = "ba", initialPrompt }: { initialAgent?: "ba" | "sysadmin"; initialPrompt?: string }) {
  const { exit } = useApp();
  const [agent, setAgent] = useState<"ba" | "sysadmin">(initialAgent);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MessageDisplay[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [currentSessionID, setCurrentSessionID] = useState("");
  const [toolCalls, setToolCalls] = useState<Map<string, ToolCallDisplay>>(new Map());
  const [busy, setBusy] = useState(false);
  const [showSessions, setShowSessions] = useState(true);

  const configRef = useRef<any>(null);
  const storageRef = useRef<Storage | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      const config = await loadConfig();
      configRef.current = config;
      const storage = initStorage(config);
      storageRef.current = storage;

      const sessionID = createSession(storage, agent, config.model, config.provider);
      setCurrentSessionID(sessionID);
      refreshSessions(storage);

      const bus = GlobalBus.getInstance();

      const unsubText = bus.on("text:delta", (data: TextDeltaEvent) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            if (data.finished) return updated;
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

      return () => {
        unsubText();
        unsubTool();
        unsubSession();
      };
    })();
  }, []);

  const refreshSessions = useCallback((storage: Storage) => {
    const list = listSessions(storage);
    setSessions(list.map((s) => ({ id: s.id, title: s.title || s.id.slice(0, 8), agent: s.agent })));
  }, []);

  const handleSubmit = useCallback(async (prompt: string) => {
    if (!prompt.trim() || busy || !storageRef.current || !configRef.current) return;

    setInput("");
    setBusy(true);
    setToolCalls(new Map());

    setMessages((prev) => [...prev, { role: "user", text: prompt }]);
    setMessages((prev) => [...prev, { role: "assistant", text: "" }]);

    abortRef.current = new AbortController();

    try {
      await runLoop({
        config: configRef.current,
        bus: GlobalBus.getInstance(),
        storage: storageRef.current,
        sessionID: currentSessionID,
        initialPrompt: prompt,
        agent,
        abortSignal: abortRef.current.signal,
      });
    } catch (err: unknown) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { ...last, text: `Error: ${err instanceof Error ? err.message : String(err)}` };
        }
        return updated;
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
      if (storageRef.current) refreshSessions(storageRef.current);
    }
  }, [busy, currentSessionID, agent, refreshSessions]);

  useInput((inputKey, key) => {
    if (key.ctrl && inputKey === "c") {
      if (busy && abortRef.current) {
        abortRef.current.abort();
        setBusy(false);
      } else {
        exit();
      }
    }
    if (key.tab) {
      setAgent((prev) => prev === "ba" ? "sysadmin" : "ba");
    }
    if (key.ctrl && inputKey === "p") {
      setShowSessions((prev) => !prev);
    }
  });

  const theme = defaultTheme;

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor={theme.primary} paddingX={1}>
        <Text bold color={theme.accent}> bacli </Text>
        <Text color={theme.secondary}>●</Text>
        <Text color={agent === "ba" ? "green" : theme.textMuted}> BA </Text>
        <Text color={theme.textMuted}>|</Text>
        <Text color={agent === "sysadmin" ? "green" : theme.textMuted}> SysAdmin </Text>
        <Text color={theme.textMuted}> | {configRef.current?.model || "no-model"} </Text>
        <Box flexGrow={1} />
        <Text color={theme.muted}>{busy ? "● running" : "● idle"}</Text>
      </Box>

      {/* Main content */}
      <Box flexGrow={1} flexDirection="row">
        {/* Session sidebar */}
        {showSessions && (
          <Box width={24} borderStyle="single" borderColor={theme.border} flexDirection="column" paddingX={1}>
            <Text bold color={theme.secondary}>Sessions</Text>
            <Box flexGrow={1} flexDirection="column">
              {sessions.map((s) => (
                <Text key={s.id} color={s.id === currentSessionID ? "green" : theme.textMuted} wrap="truncate">
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
                <Text color={msg.role === "user" ? theme.accent : theme.text} bold={msg.role === "user"}>
                  {msg.role === "user" ? "You: " : "BA: "}
                </Text>
                <Text color={theme.text}>{msg.text || (msg.role === "assistant" ? "..." : "")}</Text>
              </Box>
            ))}
            {Array.from(toolCalls.values()).map((tc) => (
              <Box key={tc.callID} flexDirection="row" marginY={0}>
                <Text color={theme.secondary}>  ● {tc.tool}: {tc.title}</Text>
              </Box>
            ))}
          </Box>

          {/* Input area */}
          <Box borderStyle="single" borderColor={theme.border} paddingX={1} flexDirection="row">
            <Text color={theme.accent} bold>{'>'} </Text>
            <Box flexGrow={1}>
              {busy ? (
                <Text color={theme.muted}>Waiting for response...</Text>
              ) : (
                <TextInput
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSubmit as any}
                  placeholder={`Ask your ${agent === "ba" ? "BA" : "SysAdmin"} agent...`}
                />
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Status bar */}
      <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.muted}>[Tab: Switch Agent] [Ctrl+P: Sessions] [Ctrl+C: {busy ? "Stop" : "Exit"}]</Text>
        <Box flexGrow={1} />
        <Text color={theme.textMuted}>session: {currentSessionID.slice(0, 8)}</Text>
      </Box>
    </Box>
  );
}

export async function renderTUI(agent: "ba" | "sysadmin", initialPrompt?: string): Promise<void> {
  const { waitUntilExit } = render(React.createElement(BacliApp, { initialAgent: agent, initialPrompt }));
  await waitUntilExit();
}
