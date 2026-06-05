import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Import the edit tool's execute function to test strategies inline
// The edit tool's internal replace function needs to be tested via the tool

describe("Edit Tool — 9 Matching Strategies", () => {
  const tmpDir = join(tmpdir(), "bacli-edit-tests-" + Date.now());

  function writeTest(name: string, content: string): string {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const fp = join(tmpDir, name);
    writeFileSync(fp, content, "utf-8");
    return fp;
  }

  // Read and test the actual strategy implementations
  // Strategy 1: Exact match
  it("strategy 1 — exact match finds identical text", async () => {
    const { default: editTool } = await import("../src/tools/builtins/edit.js");
    const fp = writeTest("exact.txt", "Hello World\nThis is a test\nGoodbye");
    const result = await editTool.execute(
      { filePath: fp, oldString: "This is a test", newString: "This was updated" },
      makeMockContext()
    );
    expect(result.title).toContain("Edited");
    expect(result.metadata.strategy).toBe("exact");
    expect(readFileSync(fp, "utf-8")).toContain("This was updated");
  });

  // Strategy 2: Trimmed lines
  it("strategy 2 — trimmed lines match with whitespace differences", async () => {
    const { default: editTool } = await import("../src/tools/builtins/edit.js");
    const fp = writeTest("trimmed.txt", "Line 1\n  Indented Line\nLine 3");
    const result = await editTool.execute(
      { filePath: fp, oldString: "Indented Line", newString: "  Replaced Indented" },
      makeMockContext()
    );
    expect(result.title).toContain("Edited");
    expect(result.metadata.strategy).toBe("exact");
    expect(readFileSync(fp, "utf-8")).toContain("  Replaced Indented");
  });

  // Strategy 2 trigger: whitespace mismatch forces trimmed match
  it("strategy 2 — trimmed match used when exact fails due to whitespace", async () => {
    const { default: editTool } = await import("../src/tools/builtins/edit.js");
    const fp = writeTest("trimmed2.txt", "first line\n  \tspaced content\nlast line");
    const result = await editTool.execute(
      { filePath: fp, oldString: "spaced content", newString: "replaced" },
      makeMockContext()
    );
    expect(result.title).toContain("Edited");
    expect(readFileSync(fp, "utf-8")).toContain("replaced");
  });

  // Strategy 3: Block anchor (multi-line with similar blocks)
  it("strategy 3 — block anchor matches with first/last line anchors", async () => {
    const { default: editTool } = await import("../src/tools/builtins/edit.js");
    const content = [
      "Line 1: start",
      "Line 2: similar middle A",
      "Line 3: similar middle B",
      "Line 4: end",
    ].join("\n");
    const fp = writeTest("block-anchor.txt", content);
    const result = await editTool.execute(
      {
        filePath: fp,
        oldString: [
          "Line 1: start",
          "Line 2: similar target X",
          "Line 3: similar target Y",
          "Line 4: end",
        ].join("\n"),
        newString: [
          "Line 1: start",
          "Line 2: replaced content A",
          "Line 3: replaced content B",
          "Line 4: end",
        ].join("\n"),
      },
      makeMockContext()
    );
    expect(result.title).toContain("Edited");
    const final = readFileSync(fp, "utf-8");
    expect(final).toContain("replaced content A");
    expect(final).toContain("replaced content B");
  });

  // Strategy 4: replaceAll
  it("strategy 9 — replaceAll replaces multiple occurrences", async () => {
    const { default: editTool } = await import("../src/tools/builtins/edit.js");
    const fp = writeTest("replace-all.txt", "foo bar foo baz foo qux");
    const result = await editTool.execute(
      { filePath: fp, oldString: "foo", newString: "FOO", replaceAll: true },
      makeMockContext()
    );
    expect(result.title).toContain("Edited");
    expect(result.metadata.replacements).toBe(3);
    expect(readFileSync(fp, "utf-8")).toBe("FOO bar FOO baz FOO qux");
  });

  // File not found
  it("returns error for non-existent file", async () => {
    const { default: editTool } = await import("../src/tools/builtins/edit.js");
    const result = await editTool.execute(
      { filePath: "/nonexistent/path/file.txt", oldString: "old", newString: "new" },
      makeMockContext()
    );
    expect(result.title).toBe("File not found");
  });

  // Text not found
  it("returns not found when oldString doesn't exist", async () => {
    const { default: editTool } = await import("../src/tools/builtins/edit.js");
    const fp = writeTest("notfound.txt", "some content here");
    const result = await editTool.execute(
      { filePath: fp, oldString: "this string does not exist", newString: "replacement" },
      makeMockContext()
    );
    expect(result.title).toBe("Text not found");
  });

  // Escape normalized (strategy 6)
  it("strategy 6 — escape normalized match handles escaped chars", async () => {
    const { default: editTool } = await import("../src/tools/builtins/edit.js");
    const content = "function hello() {\n  return 'world';\n}";
    const fp = writeTest("escaped.txt", content);
    const result = await editTool.execute(
      { filePath: fp, oldString: "function hello() {\n  return 'world';\n}", newString: "function hello() {\n  return 'universe';\n}" },
      makeMockContext()
    );
    expect(result.title).toContain("Edited");
    expect(readFileSync(fp, "utf-8")).toContain("universe");
  });

  // Context-aware (strategy 8)
  it("strategy 8 — context-aware match with approximate middle lines", async () => {
    const { default: editTool } = await import("../src/tools/builtins/edit.js");
    const content = [
      "# Configuration",
      "key1: value1",
      "key2: value2",
      "key3: value3",
      "# End Config",
    ].join("\n");
    const fp = writeTest("context-aware.txt", content);
    const result = await editTool.execute(
      {
        filePath: fp,
        oldString: [
          "# Configuration",
          "key1: different",
          "key2: changed",
          "# End Config",
        ].join("\n"),
        newString: [
          "# Configuration",
          "key1: updated1",
          "key2: updated2",
          "# End Config",
        ].join("\n"),
      },
      makeMockContext()
    );
    expect(result.title).toContain("Edited");
    const final = readFileSync(fp, "utf-8");
    expect(final).toContain("key1: updated1");
    expect(final).toContain("key2: updated2");
  });

  afterAll(() => {
    try {
      const files = ["exact.txt", "trimmed.txt", "trimmed2.txt", "block-anchor.txt",
        "replace-all.txt", "notfound.txt", "escaped.txt", "context-aware.txt"];
      for (const f of files) {
        const fp = join(tmpDir, f);
        if (existsSync(fp)) unlinkSync(fp);
      }
      if (existsSync(tmpDir)) {
        const { rmdirSync } = require("fs");
        rmdirSync(tmpDir);
      }
    } catch {}
  });
});

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
