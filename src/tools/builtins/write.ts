import { z } from "zod";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { existsSync } from "fs";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  filePath: z.string().describe("The absolute path to the file to write"),
  content: z.string().describe("The full content to write to the file"),
});

const writeTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "write",
  description: "Write content to a file. Creates parent directories if they don't exist. Overwrites existing files.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    const dir = dirname(args.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(args.filePath, args.content, "utf-8");

    return {
      title: `Written ${args.filePath}`,
      output: `Successfully wrote ${args.content.length} bytes to ${args.filePath}`,
      metadata: { path: args.filePath, bytes: args.content.length },
    };
  },
};

export default writeTool;
