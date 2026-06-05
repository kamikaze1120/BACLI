import type { z } from "zod";
import type { GlobalBus } from "../bus/event-bus.js";
import type { BacliConfig } from "../config/schema.js";
import type { PermissionActionType } from "../config/schema.js";

export type PermissionRequest = {
  tool: string;
  pattern: string;
  action: PermissionActionType;
};

export interface ToolContext {
  sessionID: string;
  messageID: string;
  agent: string;
  abort: AbortSignal;
  callID: string;
  config: BacliConfig;
  bus: GlobalBus;
  ask(perm: PermissionRequest): Promise<boolean>;
  metadata(val: Record<string, unknown>): Promise<void>;
}

export interface ExecuteResult<M = Record<string, unknown>> {
  title: string;
  output: string;
  metadata?: M;
  attachments?: FilePart[];
}

export interface FilePart {
  type: "file";
  name: string;
  mimeType: string;
  content: string | Uint8Array;
}

export interface ToolDef<P = unknown, M = Record<string, unknown>> {
  id: string;
  description: string;
  parameters: z.ZodSchema<P>;
  execute(args: P, ctx: ToolContext): Promise<ExecuteResult<M>>;
}

export type ToolResolver = (agent: string, model: string) => ToolDef[];

export function createToolContext(opts: {
  sessionID: string;
  messageID: string;
  agent: string;
  callID: string;
  config: BacliConfig;
  bus: GlobalBus;
  abort: AbortSignal;
}): ToolContext {
  const approvedOnce = new Set<string>();
  const approvedAlways = new Set<string>();

  return {
    ...opts,
    async ask(perm: PermissionRequest): Promise<boolean> {
      const key = `${perm.tool}:${perm.pattern}`;
      if (approvedAlways.has(key)) return true;

      const { evaluatePermission } = await import("../agent/permissions.js");
      const action = evaluatePermission(opts.config, perm.tool, perm.pattern, opts.agent);

      if (action === "allow") return true;
      if (action === "deny") return false;

      const requestID = `${opts.callID}:${key}`;
      opts.bus.emit("permission:request", {
        id: requestID,
        tool: perm.tool,
        pattern: perm.pattern,
        action: "ask",
      });

      return new Promise<boolean>((resolve) => {
        const unsub = opts.bus.on("permission:response", (resp) => {
          if (resp.id === requestID) {
            if (resp.approved) {
              approvedOnce.add(key);
            }
            unsub();
            resolve(resp.approved ?? false);
          }
        });
        setTimeout(() => { unsub(); resolve(false); }, 30000);
      });
    },
    async metadata(val: Record<string, unknown>): Promise<void> {
      opts.bus.emit("tool:status", {
        callID: opts.callID,
        status: "running",
        tool: "metadata",
        metadata: val,
        timestamp: Date.now(),
      });
    },
  };
}
