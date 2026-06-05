import type { BacliConfig } from "../config/schema.js";
import type { GlobalBus } from "../bus/event-bus.js";
import type { Storage } from "../storage/index.js";
import { createSession } from "../storage/messages.js";
import { runLoop } from "./loop.js";

export interface RunAgentInput {
  config: BacliConfig;
  bus: GlobalBus;
  storage: Storage;
  initialPrompt?: string;
  sessionID?: string;
  abortController?: AbortController;
}

export async function runSysAdminAgent(input: RunAgentInput): Promise<string> {
  const sessionID = input.sessionID ?? createSession(input.storage, "sysadmin", input.config.model, input.config.provider);
  const promptText = input.initialPrompt || "Hello! I'm your SysAdmin assistant. How can I help you today?";
  const controller = input.abortController ?? new AbortController();

  input.bus.emit("session", { sessionID, type: "created", agent: "sysadmin" });

  await runLoop({
    config: input.config,
    bus: input.bus,
    storage: input.storage,
    sessionID,
    initialPrompt: promptText,
    agent: "sysadmin",
    abortController: controller,
  });

  return sessionID;
}
