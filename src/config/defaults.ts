import type { BacliConfig } from "./schema.js";

export const defaultConfig: BacliConfig = {
  model: "deepseek-v4-flash",
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  smallModel: "deepseek-v4-flash",
  openrouterModel: "deepseek/deepseek-v4-flash:free",
  openrouterBaseUrl: "https://openrouter.ai/api/v1",
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
