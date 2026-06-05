import type { Storage } from "../storage/index.js";
import { getMessages } from "../storage/messages.js";

const PRUNE_PROTECT_TOKENS = 40000;
const PRUNE_MINIMUM_TOKENS = 20000;

// Rough token estimation (4 chars ≈ 1 token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface CompactionResult {
  compacted: boolean;
  removedParts: number;
  protectedTokens: number;
}

export function needsCompaction(sessionID: string, storage: Storage): boolean {
  const messages = getMessages(storage, sessionID);
  let totalTokens = 0;

  for (const msg of messages) {
    for (const part of msg.parts) {
      const data = typeof part.data === "string" ? part.data : JSON.stringify(part.data);
      totalTokens += estimateTokens(data);
    }
  }

  return totalTokens > PRUNE_PROTECT_TOKENS + PRUNE_MINIMUM_TOKENS;
}

export function runCompaction(sessionID: string, storage: Storage): CompactionResult {
  const messages = getMessages(storage, sessionID);

  // Count tokens from the end to find the protected window
  let cumulativeTokens = 0;
  let protectFromIndex = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    let msgTokens = 0;
    for (const part of msg.parts) {
      const data = typeof part.data === "string" ? part.data : JSON.stringify(part.data);
      msgTokens += estimateTokens(data);
    }
    cumulativeTokens += msgTokens;
    if (cumulativeTokens >= PRUNE_PROTECT_TOKENS) {
      protectFromIndex = i;
      break;
    }
  }

  // Remove old tool-result parts before the protected window that exceed prune minimum
  let removedParts = 0;
  for (let i = 0; i < protectFromIndex; i++) {
    const msg = messages[i];
    for (const part of msg.parts) {
      if (part.type === "tool-result") {
        const dataSize = estimateTokens(
          typeof part.data === "string" ? part.data : JSON.stringify(part.data)
        );
        if (dataSize > PRUNE_MINIMUM_TOKENS) {
          storage.prepare(
            `UPDATE message_parts SET data = ? WHERE id = ?`
          ).run(JSON.stringify({ compressed: true, originalSize: dataSize }), part.id);
          removedParts++;
        }
      }
    }
  }

  return {
    compacted: removedParts > 0,
    removedParts,
    protectedTokens: cumulativeTokens,
  };
}
