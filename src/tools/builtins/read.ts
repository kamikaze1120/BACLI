import { z } from "zod";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  filePath: z.string().describe("The absolute path to the file to read"),
  offset: z.number().optional().describe("Line number to start from (1-indexed)"),
  limit: z.number().optional().describe("Maximum number of lines to read"),
});

const readTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "read",
  description: "Read the contents of a file. Supports optional offset and limit for partial reads.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    if (!existsSync(args.filePath)) {
      return {
        title: "File not found",
        output: `Error: File not found: ${args.filePath}`,
      };
    }

    const content = await readFile(args.filePath, "utf-8");
    const lines = content.split("\n");
    const startLine = args.offset ?? 1;
    const maxLines = args.limit ?? lines.length;
    const selected = lines.slice(startLine - 1, startLine - 1 + maxLines);
    const result = selected.map((line, i) => `${startLine + i}: ${line}`).join("\n");

    return {
      title: `Read ${args.filePath}`,
      output: result || "(empty file)",
      metadata: { totalLines: lines.length, readLines: selected.length },
    };
  },
};

export default readTool;
