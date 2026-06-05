import { EventEmitter } from "events";

export type ToolStatus = "pending" | "running" | "completed" | "error";

export interface ToolStatusEvent {
  callID: string;
  status: ToolStatus;
  tool: string;
  title?: string;
  metadata?: Record<string, unknown>;
  output?: string;
  error?: string;
  timestamp: number;
}

export interface TextDeltaEvent {
  messageID: string;
  delta: string;
  finished: boolean;
}

export interface PermissionRequestEvent {
  id: string;
  tool: string;
  pattern: string;
  action: "allow" | "deny" | "ask";
  resolved?: boolean;
  approved?: boolean;
}

export interface SessionEvent {
  sessionID: string;
  type: "created" | "updated" | "deleted" | "switched";
  title?: string;
  agent?: string;
}

export interface LogEvent {
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  message: string;
  data?: unknown;
  timestamp: number;
}

type EventMap = {
  "tool:status": [ToolStatusEvent];
  "text:delta": [TextDeltaEvent];
  "permission:request": [PermissionRequestEvent];
  "permission:response": [PermissionRequestEvent];
  "session": [SessionEvent];
  "log": [LogEvent];
  "error": [Error];
};

export class GlobalBus {
  private static instance: GlobalBus;
  private emitter = new EventEmitter();
  private listenerCount = 0;

  static getInstance(): GlobalBus {
    if (!GlobalBus.instance) {
      GlobalBus.instance = new GlobalBus();
    }
    return GlobalBus.instance;
  }

  emit<K extends keyof EventMap>(event: K, ...args: EventMap[K]): void {
    this.emitter.emit(event, ...args);
  }

  on<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void): () => void {
    this.listenerCount++;
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return () => {
      this.emitter.off(event, listener as (...args: unknown[]) => void);
      this.listenerCount--;
    };
  }

  once<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void): void {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
    this.listenerCount = 0;
  }

  getListenerCount(): number {
    return this.listenerCount;
  }
}
