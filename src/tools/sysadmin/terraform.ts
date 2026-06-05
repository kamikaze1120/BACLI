import { z } from "zod";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  title: z.string().describe("Infrastructure project name"),
  provider: z.string().describe("Terraform provider (e.g., 'aws', 'azure', 'gcp', 'terraform')"),
  mainContent: z.string().describe("main.tf content"),
  variablesContent: z.string().optional().describe("variables.tf content"),
  outputsContent: z.string().optional().describe("outputs.tf content"),
  outputDir: z.string().optional().describe("Output directory"),
});

const terraformTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "terraform",
  description: "Generate Terraform configuration files (main.tf, variables.tf, outputs.tf) with proper provider setup.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    const outDir = args.outputDir || join(process.cwd(), "output", "terraform", args.title.replace(/[<>:"/\\|?*]/g, "_"));
    if (!existsSync(outDir)) {
      await mkdir(outDir, { recursive: true });
    }

    const files: Array<{ name: string; content: string }> = [
      { name: "main.tf", content: args.mainContent },
    ];

    if (args.variablesContent) {
      files.push({ name: "variables.tf", content: args.variablesContent });
    }

    if (args.outputsContent) {
      files.push({ name: "outputs.tf", content: args.outputsContent });
    }

    for (const file of files) {
      await writeFile(join(outDir, file.name), file.content, "utf-8");
    }

    return {
      title: `Generated Terraform config for ${args.title}`,
      output: [
        `Project: ${args.title}`,
        `Provider: ${args.provider}`,
        `Output directory: ${outDir}`,
        "",
        ...files.map((f) => `  Created: ${f.name}`),
        "",
        "📋 Next steps:",
        `  cd ${outDir}`,
        "  terraform init",
        "  terraform plan",
        "  terraform apply",
      ].join("\n"),
      metadata: {
        path: outDir,
        files: files.map((f) => f.name),
        provider: args.provider,
      },
    };
  },
};

export default terraformTool;
