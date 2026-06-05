import type { Storage } from "./index.js";
import { ulid } from "ulid";

export interface MessagePart {
  id: string;
  message_id: string;
  type: "text" | "tool-call" | "tool-result" | "reasoning";
  data: string;
  status: "pending" | "running" | "completed" | "error";
  call_id: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  finish_reason: string | null;
  tokens: number;
  created_at: string;
  parts: MessagePart[];
}

export function createSession(storage: Storage, agent: string, model: string, provider: string): string {
  const id = ulid();
  storage.prepare(
    `INSERT INTO sessions (id, agent, model, provider) VALUES (?, ?, ?, ?)`
  ).run(id, agent, model, provider);
  return id;
}

export function createMessage(
  storage: Storage,
  sessionID: string,
  role: "user" | "assistant" | "system"
): string {
  const id = ulid();
  storage.prepare(
    `INSERT INTO messages (id, session_id, role) VALUES (?, ?, ?)`
  ).run(id, sessionID, role);
  return id;
}

export function createPart(
  storage: Storage,
  messageID: string,
  type: MessagePart["type"],
  data: Record<string, unknown> = {},
  callID?: string
): string {
  const id = ulid();
  storage.prepare(
    `INSERT INTO message_parts (id, message_id, type, data, call_id) VALUES (?, ?, ?, ?, ?)`
  ).run(id, messageID, type, JSON.stringify(data), callID ?? null);
  return id;
}

export function updatePart(
  storage: Storage,
  partID: string,
  data: Partial<MessagePart>
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.data !== undefined) { fields.push("data = ?"); values.push(typeof data.data === "string" ? data.data : JSON.stringify(data.data)); }
  if (data.status !== undefined) { fields.push("status = ?"); values.push(data.status); }
  if (data.call_id !== undefined) { fields.push("call_id = ?"); values.push(data.call_id); }

  if (fields.length > 0) {
    values.push(partID);
    storage.prepare(`UPDATE message_parts SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }
}

export function updatePartDelta(
  storage: Storage,
  partID: string,
  delta: string
): void {
  const existing = storage.prepare(`SELECT data FROM message_parts WHERE id = ?`).get(partID) as { data: string } | undefined;
  if (existing) {
    const data = JSON.parse(existing.data);
    data.text = (data.text || "") + delta;
    storage.prepare(`UPDATE message_parts SET data = ? WHERE id = ?`).run(JSON.stringify(data), partID);
  }
}

export function getMessages(storage: Storage, sessionID: string): Message[] {
  const messages = storage.prepare(
    `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`
  ).all(sessionID) as Omit<Message, "parts">[];

  return messages.map((msg) => {
    const parts = storage.prepare(
      `SELECT * FROM message_parts WHERE message_id = ? ORDER BY created_at ASC`
    ).all(msg.id) as MessagePart[];
    return { ...msg, parts };
  });
}

export function finishMessage(
  storage: Storage,
  messageID: string,
  finishReason: string,
  tokens: number
): void {
  storage.prepare(
    `UPDATE messages SET finish_reason = ?, tokens = ? WHERE id = ?`
  ).run(finishReason, tokens, messageID);
}

export function updateSessionTitle(storage: Storage, sessionID: string, title: string): void {
  storage.prepare(
    `UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title, sessionID);
}

export function getSessionTotalTokens(storage: Storage, sessionID: string): number {
  const row = storage.prepare(
    `SELECT COALESCE(SUM(tokens), 0) as total FROM messages WHERE session_id = ?`
  ).get(sessionID) as { total: number } | undefined;
  return row?.total ?? 0;
}

export function getSessionMessagesCount(storage: Storage, sessionID: string): number {
  const row = storage.prepare(
    `SELECT COUNT(*) as count FROM messages WHERE session_id = ?`
  ).get(sessionID) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function listSessions(storage: Storage): Array<{ id: string; title: string; agent: string; created_at: string }> {
  return storage.prepare(
    `SELECT id, title, agent, created_at FROM sessions ORDER BY updated_at DESC LIMIT 50`
  ).all() as Array<{ id: string; title: string; agent: string; created_at: string }>;
}

export function forkSession(storage: Storage, sessionID: string): string {
  const original = storage.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionID) as { agent: string; model: string; provider: string; metadata: string } | undefined;
  if (!original) throw new Error(`Session ${sessionID} not found`);

  const newID = ulid();
  storage.prepare(
    `INSERT INTO sessions (id, agent, model, provider, parent_id, metadata, title) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(newID, original.agent, original.model, original.provider, sessionID, original.metadata, `${original.agent} (fork)`);

  const messages = getMessages(storage, sessionID);
  for (const msg of messages) {
    const newMsgID = ulid();
    storage.prepare(
      `INSERT INTO messages (id, session_id, role, finish_reason, tokens, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(newMsgID, newID, msg.role, msg.finish_reason, msg.tokens, msg.created_at);

    for (const part of msg.parts) {
      storage.prepare(
        `INSERT INTO message_parts (id, message_id, type, data, status, call_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(ulid(), newMsgID, part.type, part.data, part.status, part.call_id, part.created_at);
    }
  }

  return newID;
}
