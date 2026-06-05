import { describe, it, expect } from "vitest";
import { BacliConfigSchema } from "../src/config/schema.js";

describe("Config Schema Validation", () => {
  it("validates a minimal config with defaults", () => {
    const result = BacliConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe("deepseek-v4-flash");
      expect(result.data.provider).toBe("deepseek");
      expect(result.data.logLevel).toBe("INFO");
      expect(result.data.toolOutput?.maxLines).toBe(200);
      expect(result.data.compaction?.auto).toBe(true);
    }
  });

  it("accepts a full valid config", () => {
    const config = {
      model: "deepseek-v4-pro",
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-test-key",
      logLevel: "DEBUG" as const,
      agent: {
        ba: {
          description: "BA agent",
          permission: { bash: "ask" },
        },
      },
      permission: {
        read: { "*.env": "deny" },
      },
    };
    const result = BacliConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("rejects invalid logLevel", () => {
    const result = BacliConfigSchema.safeParse({ logLevel: "INVALID" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid permission action", () => {
    const result = BacliConfigSchema.safeParse({
      permission: { bash: "maybe" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts agent with all optional fields", () => {
    const config = {
      agent: {
        ba: {
          description: "BA agent",
          model: "deepseek-v4-flash",
          temperature: 0.7,
          topP: 0.9,
          steps: 100,
          permission: { edit: "allow", bash: "ask" },
        },
      },
    };
    const result = BacliConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("accepts toolOutput config", () => {
    const config = {
      toolOutput: { maxLines: 500, maxBytes: 16000 },
    };
    const result = BacliConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolOutput?.maxLines).toBe(500);
    }
  });

  it("accepts compaction config", () => {
    const config = {
      compaction: { auto: false, tailTurns: 5 },
    };
    const result = BacliConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.compaction?.auto).toBe(false);
      expect(result.data.compaction?.tailTurns).toBe(5);
    }
  });

  it("accepts disabledProviders and enabledProviders", () => {
    const config = {
      disabledProviders: ["openai"],
      enabledProviders: ["deepseek"],
    };
    const result = BacliConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.disabledProviders).toEqual(["openai"]);
    }
  });

  it("accepts $schema field", () => {
    const result = BacliConfigSchema.safeParse({
      $schema: "https://bacli.dev/config.json",
    });
    expect(result.success).toBe(true);
  });

  it("handles nested agent permissions with glob patterns", () => {
    const config = {
      agent: {
        ba: {
          permission: {
            read: { "*.md": "allow", "*.env": "deny" },
          },
        },
      },
    };
    const result = BacliConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
