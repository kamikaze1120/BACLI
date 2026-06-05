import { describe, it, expect } from "vitest";
import { evaluatePermission } from "../src/agent/permissions.js";
import { builtinAgents } from "../src/agent/agent.js";
import { BacliConfigSchema, type BacliConfig } from "../src/config/schema.js";

describe("Agent Definitions", () => {
  it("defines BA agent", () => {
    expect(builtinAgents.ba).toBeDefined();
    expect(builtinAgents.ba.mode).toBe("primary");
    expect(builtinAgents.ba.description).toContain("Business Analyst");
  });

  it("defines SysAdmin agent", () => {
    expect(builtinAgents.sysadmin).toBeDefined();
    expect(builtinAgents.sysadmin.mode).toBe("primary");
    expect(builtinAgents.sysadmin.description).toContain("System Administrator");
  });

  it("has unique agent names", () => {
    const names = Object.keys(builtinAgents);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("Agent Permissions Integration", () => {
  function configWithBA(permission: Record<string, unknown>): BacliConfig {
    return BacliConfigSchema.parse({
      agent: {
        ba: {
          description: "BA agent",
          permission,
        },
      },
    });
  }

  it("BA allows edit by default in config", () => {
    const config = configWithBA({ edit: "allow" });
    expect(evaluatePermission(config, "edit", "src/file.ts", "ba")).toBe("allow");
  });

  it("BA asks for bash by default in config", () => {
    const config = configWithBA({ bash: "ask" });
    expect(evaluatePermission(config, "bash", "rm -rf /", "ba")).toBe("ask");
  });

  it("SysAdmin denies question by default", () => {
    const config = BacliConfigSchema.parse({
      agent: {
        sysadmin: {
          description: "SysAdmin agent",
          permission: { question: "deny" },
        },
      },
    });
    expect(evaluatePermission(config, "question", "anything", "sysadmin")).toBe("deny");
  });

  it("SysAdmin asks for SSH by default", () => {
    const config = BacliConfigSchema.parse({
      agent: {
        sysadmin: {
          permission: { ssh: "ask" },
        },
      },
    });
    expect(evaluatePermission(config, "ssh", "user@host:22", "sysadmin")).toBe("ask");
  });
});

describe("Config Default Merging", () => {
  it("default config has correct structure", async () => {
    const { defaultConfig } = await import("../src/config/defaults.js");
    expect(defaultConfig.model).toBe("deepseek-v4-flash");
    expect(defaultConfig.provider).toBe("deepseek");
    expect(defaultConfig.baseUrl).toBe("https://api.deepseek.com");
    expect(defaultConfig.compaction?.auto).toBe(true);
    expect(defaultConfig.toolOutput?.maxBytes).toBe(8192);
  });

  it("default config has BA agent permissions", async () => {
    const { defaultConfig } = await import("../src/config/defaults.js");
    expect(defaultConfig.agent?.ba?.permission?.edit).toBe("allow");
    expect(defaultConfig.agent?.ba?.permission?.bash).toBe("ask");
  });

  it("default config has SysAdmin agent permissions", async () => {
    const { defaultConfig } = await import("../src/config/defaults.js");
    expect(defaultConfig.agent?.sysadmin?.permission?.ssh).toBe("ask");
    expect(defaultConfig.agent?.sysadmin?.permission?.question).toBe("deny");
  });
});
