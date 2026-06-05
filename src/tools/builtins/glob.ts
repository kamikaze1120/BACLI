import { z } from "zod";
import { glob } from "glob";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  pattern: z.string().describe("Glob pattern to match files (e.g., 'src/**/*.ts')"),
  path: z.string().optional().describe("Directory to search in (defaults to cwd)"),
});

const globTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "glob",
  description: "Find files matching a glob pattern. Fast file search supporting wildcards and recursive patterns.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    const matches = await glob(args.pattern, {
      cwd: args.path,
      nodir: false,
      dot: true,
    });

    if (matches.length === 0) {
      return {
        title: "No matches",
        output: `No files found matching pattern: ${args.pattern}`,
      };
    }

    const sorted = matches.sort();
    const output = sorted.slice(0, 200).join("\n");
    const truncated = sorted.length > 200 ? `\n... and ${sorted.length - 200} more files` : "";

    return {
      title: `Found ${sorted.length} files`,
      output: output + truncated,
      metadata: { total: sorted.length, shown: Math.min(sorted.length, 200) },
    };
  },
};

export default globTool;
