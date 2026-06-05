import type { BacliConfig, PermissionActionType, AgentConfig } from "../config/schema.js";

export interface ParsedRule {
  tool: string;
  pattern: string;
  action: PermissionActionType;
}

function normalizeRules(rules: Record<string, unknown>): ParsedRule[] {
  const result: ParsedRule[] = [];

  for (const [key, value] of Object.entries(rules)) {
    if (typeof value === "string" && ["allow", "deny", "ask"].includes(value)) {
      result.push({ tool: key, pattern: "*", action: value as PermissionActionType });
    } else if (typeof value === "object" && value !== null) {
      const subRules = value as Record<string, unknown>;
      for (const [pattern, action] of Object.entries(subRules)) {
        if (typeof action === "string" && ["allow", "deny", "ask"].includes(action)) {
          result.push({ tool: key, pattern, action: action as PermissionActionType });
        }
      }
    }
  }

  return result;
}

function matchPattern(pattern: string, input: string): boolean {
  if (pattern === "*") return true;
  // Convert glob to regex: *.env should match .env, src/*.ts, etc.
  let regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  // If pattern starts with `*`, it should also match inputs starting with `.`
  if (pattern.startsWith("*.")) {
    regexStr = `(?:${regexStr})`;
  }
  const regex = new RegExp("^" + regexStr + "$");
  return regex.test(input);
}

export function evaluatePermission(
  config: BacliConfig,
  tool: string,
  input: string,
  agentName: string
): PermissionActionType {
  const rules: ParsedRule[] = [];

  // 1. Default: allow everything
  rules.push({ tool: "*", pattern: "*", action: "allow" });

  // 2. Global permission rules
  if (config.permission) {
    rules.push(...normalizeRules(config.permission as unknown as Record<string, unknown>));
  }

  // 3. Agent-specific rules (last = highest priority)
  const agentCfg = config.agent?.[agentName];
  if (agentCfg?.permission) {
    rules.push(...normalizeRules(agentCfg.permission as unknown as Record<string, unknown>));
  }

  // Find the most specific matching rule.
  // Prefer non-wildcard patterns over "*", and last wins among equally specific.
  let result: PermissionActionType = "allow";
  let bestSpecificity = -1;

  for (const rule of rules) {
    if (matchPattern(rule.tool, tool) && matchPattern(rule.pattern, input)) {
      // Specificity: length of pattern, with "*" being least specific (-1)
      const specificity = rule.pattern === "*" ? -1 : rule.pattern.length;
      if (specificity > bestSpecificity || (specificity === bestSpecificity && specificity >= 0)) {
        result = rule.action;
        bestSpecificity = specificity;
      } else if (specificity === -1 && bestSpecificity === -1) {
        // Both are wildcards: last wins
        result = rule.action;
      }
    }
  }

  return result;
}
