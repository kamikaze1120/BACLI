import { z } from "zod";
import { execSync } from "child_process";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  pattern: z.string().describe("The regex pattern to search for"),
  path: z.string().optional().describe("Directory to search in (defaults to cwd)"),
  include: z.string().optional().describe("File pattern to include (e.g., '*.ts')"),
});

const grepTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "grep",
  description: "Search file contents using regular expressions. Fast content search across the codebase.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    const cwd = args.path || process.cwd();
    let command = "";

    if (process.platform === "win32") {
      // Use findstr on Windows
      command = `findstr /s /n /c:"${args.pattern}" "${args.include || '*.*'}"`;
    } else {
      command = `grep -rn '${args.pattern}' ${args.include ? `--include="${args.include}"` : ""} .`;
    }

    try {
      const output = execSync(command, {
        cwd,
        timeout: 30000,
        maxBuffer: 5 * 1024 * 1024,
        encoding: "utf-8",
        windowsHide: true,
      });

      const lines = output.split("\n").filter((l) => l.trim());
      const truncated = lines.slice(0, 100);
      const remainder = lines.length > 100 ? `\n... and ${lines.length - 100} more matches` : "";

      return {
        title: `Found ${lines.length} matches`,
        output: truncated.join("\n") + remainder,
        metadata: { total: lines.length, shown: Math.min(lines.length, 100) },
      };
    } catch (err: unknown) {
      if (err instanceof Error) {
        const execErr = err as { stderr?: string; status?: number };
        if (execErr.status === 1) {
          return { title: "No matches", output: `No matches found for pattern: ${args.pattern}` };
        }
        return { title: "Search failed", output: execErr.stderr || err.message };
      }
      return { title: "Search failed", output: String(err) };
    }
  },
};

export default grepTool;
