import { z } from "zod";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  title: z.string().describe("Project/service name"),
  composeContent: z.string().optional().describe("docker-compose.yml content"),
  dockerfileContent: z.string().optional().describe("Dockerfile content (optional)"),
  outputDir: z.string().optional().describe("Output directory"),
});

const dockerTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "docker",
  description: "Generate Dockerfile and docker-compose.yml files for containerized applications.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    const outDir = args.outputDir || join(process.cwd(), "output", "docker", args.title.replace(/[<>:"/\\|?*]/g, "_"));
    if (!existsSync(outDir)) {
      await mkdir(outDir, { recursive: true });
    }

    const files: Array<{ name: string; content: string }> = [];

    if (args.composeContent) {
      files.push({ name: "docker-compose.yml", content: args.composeContent });
    }

    if (args.dockerfileContent) {
      files.push({ name: "Dockerfile", content: args.dockerfileContent });
    }

    for (const file of files) {
      const filePath = join(outDir, file.name);
      await writeFile(filePath, file.content, "utf-8");
    }

    return {
      title: `Generated Docker config for ${args.title}`,
      output: [
        `Project: ${args.title}`,
        `Output directory: ${outDir}`,
        "",
        ...files.map((f) => `  Created: ${f.name}`),
        "",
        "Files generated. Review and test before deploying.",
      ].join("\n"),
      metadata: {
        path: outDir,
        files: files.map((f) => f.name),
      },
    };
  },
};

export default dockerTool;
