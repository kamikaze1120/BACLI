import Database from "better-sqlite3";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { BacliConfig } from "../config/schema.js";

export interface Storage {
  db: Database.Database;
  prepare: Database.Database["prepare"];
  close: () => void;
}

let dbInstance: Database.Database | null = null;

export function initStorage(config: BacliConfig): Storage {
  if (dbInstance) {
    return { db: dbInstance, prepare: dbInstance.prepare.bind(dbInstance), close: () => dbInstance?.close() };
  }

  const dataDir = join(process.env.HOME || process.env.USERPROFILE || ".", ".bacli");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = join(dataDir, "bacli.db");
  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");

  initializeSchema(dbInstance);

  return {
    db: dbInstance,
    prepare: dbInstance.prepare.bind(dbInstance),
    close: () => { dbInstance?.close(); dbInstance = null; },
  };
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT DEFAULT '',
      agent TEXT NOT NULL DEFAULT 'ba',
      model TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
      provider TEXT NOT NULL DEFAULT 'deepseek',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      parent_id TEXT,
      metadata TEXT DEFAULT '{}',
      FOREIGN KEY (parent_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      finish_reason TEXT,
      tokens INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_parts (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('text', 'tool-call', 'tool-result', 'reasoning')),
      data TEXT NOT NULL DEFAULT '{}',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'error')),
      call_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_message_parts_message ON message_parts(message_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
  `);
}
