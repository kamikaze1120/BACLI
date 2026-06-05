import { describe, it, expect } from "vitest";
import { evaluatePermission, type ParsedRule } from "../src/agent/permissions.js";
import type { BacliConfig } from "../src/config/schema.js";

function makeConfig(overrides?: Partial<BacliConfig>): BacliConfig {
  return {
    $schema: undefined,
    model: "deepseek-v4-flash",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    apiKey: "",
    smallModel: "deepseek-v4-flash",
    shell: "bash",
    logLevel: "INFO",
    username: "test",
    disabledProviders: [],
    enabledProviders: [],
    agent: {},
    permission: {},
    toolOutput: { maxLines: 200, maxBytes: 8192 },
    compaction: { auto: true, tailTurns: 15 },
    ...overrides,
  };
}

describe("Permission Evaluator", () => {
  it("allows everything by default", () => {
    const config = makeConfig();
    expect(evaluatePermission(config, "bash", "echo hello", "ba")).toBe("allow");
    expect(evaluatePermission(config, "read", "*.env", "ba")).toBe("allow");
  });

  it("denies a tool when configured at global level", () => {
    const config = makeConfig({
      permission: { bash: "deny" },
    });
    expect(evaluatePermission(config, "bash", "rm -rf /", "ba")).toBe("deny");
  });

  it("allows a tool when global denies but agent allows", () => {
    const config = makeConfig({
      permission: { bash: "deny" },
      agent: {
        ba: {
          description: "BA agent",
          permission: { bash: "allow" },
        },
      },
    });
    expect(evaluatePermission(config, "bash", "echo test", "ba")).toBe("allow");
  });

  it("agent permission overrides global (last wins)", () => {
    const config = makeConfig({
      permission: { bash: "allow" },
      agent: {
        ba: {
          description: "BA agent",
          permission: { bash: "deny" },
        },
      },
    });
    expect(evaluatePermission(config, "bash", "echo test", "ba")).toBe("deny");
  });

  it("asks for sensitive operations when configured", () => {
    const config = makeConfig({
      permission: { bash: "ask" },
    });
    expect(evaluatePermission(config, "bash", "rm -rf /", "ba")).toBe("ask");
  });

  it("glob patterns work for tool matching", () => {
    const config = makeConfig({
      permission: {
        read: { "*.env": "deny" },
      },
    });
    expect(evaluatePermission(config, "read", ".env", "ba")).toBe("deny");
    expect(evaluatePermission(config, "read", "prod.env", "ba")).toBe("deny");
    expect(evaluatePermission(config, "read", "src/main.ts", "ba")).toBe("allow");
  });

  it("nested glob patterns in agent permission work", () => {
    const config = makeConfig({
      agent: {
        ba: {
          description: "BA agent",
          permission: {
            edit: { "*.md": "allow", "*": "deny" },
          },
        },
      },
    });
    expect(evaluatePermission(config, "edit", "README.md", "ba")).toBe("allow");
    expect(evaluatePermission(config, "edit", "src/main.ts", "ba")).toBe("deny");
  });

  it("sysadmin agent default permissions", () => {
    const config = makeConfig({
      agent: {
        sysadmin: {
          description: "SysAdmin agent",
          permission: {
            ssh: "ask",
            question: "deny",
          },
        },
      },
    });
    expect(evaluatePermission(config, "ssh", "user@host", "sysadmin")).toBe("ask");
    expect(evaluatePermission(config, "question", "anything", "sysadmin")).toBe("deny");
    expect(evaluatePermission(config, "bash", "ls", "sysadmin")).toBe("allow");
  });

  it("handles empty agent config gracefully", () => {
    const config = makeConfig();
    expect(evaluatePermission(config, "glob", "**/*.ts", "nonexistent-agent")).toBe("allow");
  });
});
