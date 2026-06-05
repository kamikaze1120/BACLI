import type { BacliConfig } from "./schema.js";

export const defaultConfig: BacliConfig = {
  model: "deepseek-ai/deepseek-v4-flash",
  provider: "nvidia",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  apiKey: "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",
  smallModel: "deepseek-ai/deepseek-v4-flash",
  maxTokens: 16384,
  temperature: 1,
  topP: 0.95,
  shell: process.platform === "win32" ? "powershell" : "bash",
  logLevel: "INFO",
  username: "user",
  disabledProviders: [],
  enabledProviders: [],
  agent: {
    ba: {
      description: "Business Analyst agent for document generation, analysis, and requirements",
      permission: {
        edit: "allow",
        bash: "ask",
        read: "allow",
        glob: "allow",
        grep: "allow",
        webfetch: "allow",
        websearch: "allow",
        question: "allow",
      },
    },
    sysadmin: {
      description: "System Administrator agent for infrastructure, scripts, and configs",
      permission: {
        edit: "allow",
        bash: "allow",
        read: "allow",
        glob: "allow",
        grep: "allow",
        webfetch: "allow",
        websearch: "allow",
        ssh: "ask",
        question: "deny",
      },
    },
  },
  permission: {
    read: {
      "*.env": "ask",
      "*.env.*": "ask",
    },
  },
  toolOutput: {
    maxLines: 200,
    maxBytes: 8192,
  },
  compaction: {
    auto: true,
    tailTurns: 15,
  },
};
