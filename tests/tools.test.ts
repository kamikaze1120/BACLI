import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function makeMockContext() {
  return {
    sessionID: "test-session",
    messageID: "test-msg",
    agent: "test",
    callID: "test-call",
    config: {} as any,
    bus: { emit: () => {} } as any,
    abort: new AbortController().signal,
    ask: async () => true,
    metadata: async () => {},
  };
}

const tmpDir = join(tmpdir(), "bacli-tool-tests-" + Date.now());

describe("Read Tool", () => {
  beforeAll(() => {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const lines: string[] = [];
    for (let i = 1; i <= 100; i++) lines.push(`Line ${i}`);
    writeFileSync(join(tmpDir, "read-test.txt"), lines.join("\n"), "utf-8");
    writeFileSync(join(tmpDir, "hello.txt"), "Hello World!", "utf-8");
  });

  it("reads entire file", async () => {
    const { default: readTool } = await import("../src/tools/builtins/read.js");
    const result = await readTool.execute(
      { filePath: join(tmpDir, "hello.txt") },
      makeMockContext()
    );
    expect(result.title).toContain("Read");
    expect(result.output).toContain("Hello World!");
    expect(result.metadata?.totalLines).toBe(1);
  });

  it("reads with offset", async () => {
    const { default: readTool } = await import("../src/tools/builtins/read.js");
    const result = await readTool.execute(
      { filePath: join(tmpDir, "read-test.txt"), offset: 50, limit: 2 },
      makeMockContext()
    );
    expect(result.output).toContain("50: Line 50");
    expect(result.output).toContain("51: Line 51");
  });

  it("returns error for missing file", async () => {
    const { default: readTool } = await import("../src/tools/builtins/read.js");
    const result = await readTool.execute(
      { filePath: "/nonexistent/file.txt" },
      makeMockContext()
    );
    expect(result.title).toBe("File not found");
  });

  afterAll(() => {
    try {
      ["read-test.txt", "hello.txt"].forEach((f) => {
        const fp = join(tmpDir, f);
        if (existsSync(fp)) unlinkSync(fp);
      });
    } catch {}
  });
});

describe("Write Tool", () => {
  const writeDir = join(tmpDir, "write-tests");

  it("writes content to a new file", async () => {
    const { default: writeTool } = await import("../src/tools/builtins/write.js");
    const fp = join(writeDir, "new-file.txt");
    const result = await writeTool.execute(
      { filePath: fp, content: "test content here" },
      makeMockContext()
    );
    expect(result.title).toContain("Written");
    expect(result.metadata?.bytes).toBe(17);
  });

  it("overwrites existing file", async () => {
    const { default: writeTool } = await import("../src/tools/builtins/write.js");
    const fp = join(writeDir, "overwrite.txt");
    await writeTool.execute({ filePath: fp, content: "version 1" }, makeMockContext());
    const result = await writeTool.execute({ filePath: fp, content: "version 2" }, makeMockContext());
    expect(result.metadata?.bytes).toBe(9);
  });

  afterAll(() => {
    try {
      const { rmSync } = require("fs");
      if (existsSync(writeDir)) rmSync(writeDir, { recursive: true });
    } catch {}
  });
});

describe("Glob Tool", () => {
  const globDir = join(tmpDir, "glob-tests");

  beforeAll(() => {
    if (!existsSync(globDir)) mkdirSync(globDir, { recursive: true });
    writeFileSync(join(globDir, "a.ts"), "", "utf-8");
    writeFileSync(join(globDir, "b.ts"), "", "utf-8");
    writeFileSync(join(globDir, "c.js"), "", "utf-8");
    writeFileSync(join(globDir, "d.json"), "", "utf-8");
    const subDir = join(globDir, "sub");
    if (!existsSync(subDir)) mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, "e.ts"), "", "utf-8");
  });

  it("finds .ts files recursively", async () => {
    const { default: globTool } = await import("../src/tools/builtins/glob.js");
    const result = await globTool.execute(
      { pattern: "**/*.ts", path: globDir },
      makeMockContext()
    );
    expect(result.metadata?.total).toBe(3);
    expect(result.output).toContain("a.ts");
    expect(result.output).toContain("b.ts");
  });

  it("returns no matches for nonexistent pattern", async () => {
    const { default: globTool } = await import("../src/tools/builtins/glob.js");
    const result = await globTool.execute(
      { pattern: "**/*.rust", path: globDir },
      makeMockContext()
    );
    expect(result.title).toBe("No matches");
  });

  afterAll(() => {
    try {
      const { rmSync } = require("fs");
      if (existsSync(globDir)) rmSync(globDir, { recursive: true });
    } catch {}
  });
});

describe("WebFetch Tool", () => {
  it("returns error for invalid URL", async () => {
    const { default: webfetchTool } = await import("../src/tools/builtins/webfetch.js");
    const result = await webfetchTool.execute(
      { url: "https://invalid.domain.xyz.test", format: "text" },
      makeMockContext()
    );
    expect(result.title).toBe("Fetch error" || "Fetch failed");
  });
});

describe("Tool Registry", () => {
  it("resolves BA agent tools", async () => {
    const { resolveTools } = await import("../src/tools/registry.js");
    const tools = await resolveTools("ba", "deepseek-v4-flash", {} as any);
    expect(tools.bash).toBeDefined();
    expect(tools.read).toBeDefined();
    expect(tools.write).toBeDefined();
    expect(tools.edit).toBeDefined();
    expect(tools.glob).toBeDefined();
    expect(tools.grep).toBeDefined();
    expect(tools.webfetch).toBeDefined();
    expect(tools.document).toBeDefined();
    expect(tools.spreadsheet).toBeDefined();
    expect(tools.diagram).toBeDefined();
    expect(tools.template).toBeDefined();
    expect(tools.dataAnalysis).toBeDefined();
    expect(tools.sql).toBeDefined();
    expect(tools.ssh).toBeUndefined();
  });

  it("resolves SysAdmin agent tools", async () => {
    const { resolveTools } = await import("../src/tools/registry.js");
    const tools = await resolveTools("sysadmin", "deepseek-v4-flash", {} as any);
    expect(tools.ssh).toBeDefined();
    expect(tools.scriptGen).toBeDefined();
    expect(tools.docker).toBeDefined();
    expect(tools.k8s).toBeDefined();
    expect(tools.terraform).toBeDefined();
    expect(tools.network).toBeDefined();
    expect(tools.document).toBeUndefined();
  });
});

describe("Document Tool — Markdown", () => {
  const docDir = join(tmpDir, "doc-tests");

  it("generates markdown document", async () => {
    const { default: docTool } = await import("../src/tools/ba/document.js");
    const result = await docTool.execute(
      { format: "md", title: "Test Doc", content: "Hello from test" },
      makeMockContext()
    );
    expect(result.title).toContain("Generated");
    expect(result.output).toContain(".md");
  });
});

describe("Template Tool", () => {
  it("lists available templates", async () => {
    const { default: templateTool } = await import("../src/tools/ba/template.js");
    const result = await templateTool.execute(
      { template: "list" },
      makeMockContext()
    );
    expect(result.title).toBe("Available templates");
    expect(result.output).toContain("brd");
    expect(result.output).toContain("user-story");
  });

  it("generates a BRD template with data", async () => {
    const { default: templateTool } = await import("../src/tools/ba/template.js");
    const result = await templateTool.execute(
      {
        template: "brd",
        data: {
          project: "Test Project",
          author: "Test User",
          executiveSummary: "A test project summary",
        },
      },
      makeMockContext()
    );
    expect(result.title).toContain("Business Requirements Document");
    expect(result.output).toContain("brd");
  });

  it("returns error for nonexistent template", async () => {
    const { default: templateTool } = await import("../src/tools/ba/template.js");
    const result = await templateTool.execute(
      { template: "nonexistent" },
      makeMockContext()
    );
    expect(result.title).toBe("Template not found");
  });
});

describe("Data Analysis Tool", () => {
  it("analyzes CSV data", async () => {
    const csvPath = join(tmpDir, "test-data.csv");
    writeFileSync(csvPath, "name,age,city\nAlice,30,NYC\nBob,25,LA\nCharlie,35,SF", "utf-8");

    const { default: dataAnalysisTool } = await import("../src/tools/ba/data-analysis.js");
    const result = await dataAnalysisTool.execute(
      { filePath: csvPath, format: "csv", analysis: "summary" },
      makeMockContext()
    );
    expect(result.title).toContain("Analysis");
    expect(result.metadata?.records).toBe(3);
    expect(result.output).toContain("name");
    expect(result.output).toContain("age");

    unlinkSync(csvPath);
  });

  it("analyzes JSON data", async () => {
    const jsonPath = join(tmpDir, "test-data.json");
    writeFileSync(jsonPath, JSON.stringify([
      { product: "A", price: 10 },
      { product: "B", price: 20 },
      { product: "C", price: 30 },
    ]), "utf-8");

    const { default: dataAnalysisTool } = await import("../src/tools/ba/data-analysis.js");
    const result = await dataAnalysisTool.execute(
      { filePath: jsonPath, format: "json", analysis: "summary" },
      makeMockContext()
    );
    expect(result.metadata?.records).toBe(3);
    expect(result.output).toContain("product");

    unlinkSync(jsonPath);
  });
});

describe("SQL Tool", () => {
  it("analyzes SQL query structure", async () => {
    const { default: sqlTool } = await import("../src/tools/ba/sql.js");
    const result = await sqlTool.execute(
      { query: "SELECT * FROM users WHERE active = 1", operation: "analyze", dialect: "generic" },
      makeMockContext()
    );
    expect(result.title).toContain("SQL analyze");
    expect(result.output).toContain("SELECT");
    expect(result.output).toContain("WHERE");
  });

  it("provides optimization suggestions", async () => {
    const { default: sqlTool } = await import("../src/tools/ba/sql.js");
    const result = await sqlTool.execute(
      { query: "SELECT * FROM orders", operation: "optimize", dialect: "postgresql" },
      makeMockContext()
    );
    expect(result.output).toContain("Optimization");
    expect(result.metadata?.dialect).toBe("postgresql");
  });
});

describe("SysAdmin Script Tool", () => {
  it("generates a bash script", async () => {
    const { default: scriptTool } = await import("../src/tools/sysadmin/script-gen.js");
    const result = await scriptTool.execute(
      { title: "backup", language: "bash", description: "Backup script", content: "#!/bin/bash\necho backing up" },
      makeMockContext()
    );
    expect(result.title).toContain("bash");
    expect(result.output).toContain(".sh");
    expect(result.metadata?.language).toBe("bash");
  });

  it("generates a PowerShell script", async () => {
    const { default: scriptTool } = await import("../src/tools/sysadmin/script-gen.js");
    const result = await scriptTool.execute(
      { title: "deploy", language: "powershell", description: "Deploy script", content: "Write-Host deploying" },
      makeMockContext()
    );
    expect(result.title).toContain("powershell");
    expect(result.output).toContain(".ps1");
  });
});

describe("Docker Tool", () => {
  it("generates compose file", async () => {
    const { default: dockerTool } = await import("../src/tools/sysadmin/docker.js");
    const result = await dockerTool.execute(
      { title: "webapp", composeContent: "version: '3'\nservices:\n  app:\n    image: nginx" },
      makeMockContext()
    );
    expect(result.title).toContain("Docker");
    expect(result.output).toContain("docker-compose.yml");
    expect(result.metadata?.files).toContain("docker-compose.yml");
  });
});

describe("K8s Tool", () => {
  it("generates manifests", async () => {
    const { default: k8sTool } = await import("../src/tools/sysadmin/k8s.js");
    const result = await k8sTool.execute(
      { title: "myapp", manifests: "apiVersion: v1\nkind: Pod\nmetadata:\n  name: my-pod" },
      makeMockContext()
    );
    expect(result.title).toContain("K8s");
    expect(result.output).toContain("pod-my-pod.yaml");
  });
});

describe("Terraform Tool", () => {
  it("generates terraform files", async () => {
    const { default: terraformTool } = await import("../src/tools/sysadmin/terraform.js");
    const result = await terraformTool.execute(
      { title: "vpc", provider: "aws", mainContent: 'resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }' },
      makeMockContext()
    );
    expect(result.title).toContain("Terraform");
    expect(result.output).toContain("main.tf");
  });
});

describe("Network Tool", () => {
  it("generates network config", async () => {
    const { default: networkTool } = await import("../src/tools/sysadmin/network.js");
    const result = await networkTool.execute(
      { operation: "config", target: "example.com" },
      makeMockContext()
    );
    expect(result.title).toContain("Network");
    expect(result.output).toContain("example.com");
  });
});

describe("Bash Tool", () => {
  it("executes a simple command", async () => {
    const { default: bashTool } = await import("../src/tools/builtins/bash.js");
    const result = await bashTool.execute(
      { command: "echo hello from bacli", description: "test echo" },
      makeMockContext()
    );
    expect(result.title).toBe("test echo");
    expect(result.output).toContain("hello from bacli");
  });

  it("handles permission denial", async () => {
    const { default: bashTool } = await import("../src/tools/builtins/bash.js");
    const deniedCtx = {
      ...makeMockContext(),
      ask: async () => false,
    };
    const result = await bashTool.execute(
      { command: "rm -rf /", description: "dangerous" },
      deniedCtx
    );
    expect(result.title).toBe("Command rejected");
  });
});
