import { z } from "zod";
import { execSync, exec } from "child_process";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  command: z.string().describe("The shell command to execute"),
  description: z.string().describe("Brief description of what this command does (5-10 words)"),
  timeout: z.number().optional().describe("Timeout in milliseconds"),
  workdir: z.string().optional().describe("Working directory for the command"),
});

const bashTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "bash",
  description: "Execute shell commands. Use for running scripts, tools, and system operations.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    const allowed = await ctx.ask({
      tool: "bash",
      pattern: args.command,
      action: "ask",
    });

    if (!allowed) {
      return {
        title: "Command rejected",
        output: "Permission denied: bash execution was not approved.",
      };
    }

    const timeout = args.timeout ?? 120000;

    try {
      const output = execSync(args.command, {
        cwd: args.workdir,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        encoding: "utf-8",
        windowsHide: true,
      });

      return {
        title: args.description || "Command executed",
        output: output || "(no output)",
      };
    } catch (err: unknown) {
      if (err instanceof Error && "stderr" in err) {
        const execErr = err as { stderr?: string; stdout?: string; status?: number };
        return {
          title: "Command failed",
          output: execErr.stderr || execErr.stdout || err.message,
        };
      }
      return {
        title: "Command failed",
        output: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

export default bashTool;
