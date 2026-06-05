import { z } from "zod";

const PermissionAction = z.enum(["allow", "ask", "deny"] as const);

const PermissionRules = z.union([
  PermissionAction,
  z.record(z.string(), z.union([PermissionAction, z.record(z.string(), PermissionAction)])),
]);

export const AgentConfigSchema = z.object({
  description: z.string().optional(),
  model: z.string().optional(),
  permission: z.record(z.string(), PermissionRules).optional(),
  prompt: z.string().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  steps: z.number().optional(),
  disabled: z.boolean().optional(),
});

export const BacliConfigSchema = z.object({
  $schema: z.string().optional(),
  model: z.string().default("deepseek-ai/deepseek-v4-flash"),
  provider: z.string().default("nvidia"),
  baseUrl: z.string().default("https://integrate.api.nvidia.com/v1"),
  apiKey: z.string().default("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"),
  smallModel: z.string().default("deepseek-ai/deepseek-v4-flash"),
  maxTokens: z.number().default(16384),
  temperature: z.number().default(1),
  topP: z.number().default(0.95),
  shell: z.string().default("powershell"),
  logLevel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"] as const).default("INFO"),
  username: z.string().default("user"),
  disabledProviders: z.array(z.string()).default([]),
  enabledProviders: z.array(z.string()).default([]),
  agent: z.record(z.string(), AgentConfigSchema).optional(),
  permission: z.record(z.string(), PermissionRules).optional(),
  toolOutput: z
    .object({
      maxLines: z.number().default(200),
      maxBytes: z.number().default(8192),
    })
    .default({ maxLines: 200, maxBytes: 8192 })
    .optional(),
  compaction: z
    .object({
      auto: z.boolean().default(true),
      tailTurns: z.number().default(15),
    })
    .default({ auto: true, tailTurns: 15 })
    .optional(),
});

export type BacliConfig = z.infer<typeof BacliConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type PermissionActionType = z.infer<typeof PermissionAction>;
