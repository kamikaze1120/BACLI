import { z } from "zod";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  title: z.string().describe("Application/service name"),
  manifests: z.string().describe("Kubernetes manifest content (YAML)"),
  outputDir: z.string().optional().describe("Output directory"),
});

const k8sTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "k8s",
  description: "Generate Kubernetes manifest files (Deployment, Service, ConfigMap, etc.)",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    const outDir = args.outputDir || join(process.cwd(), "output", "k8s", args.title.replace(/[<>:"/\\|?*]/g, "_"));
    if (!existsSync(outDir)) {
      await mkdir(outDir, { recursive: true });
    }

    // Split multi-document YAML into separate files
    const documents = args.manifests.split(/(?=^---\s*$)/m).filter((d) => d.trim());
    const files: Array<{ name: string; content: string }> = [];

    for (const doc of documents) {
      // Extract kind and name for filename
      const kindMatch = doc.match(/^kind:\s*(\w+)/m);
      const nameMatch = doc.match(/^  name:\s*(\S+)/m);
      const kind = kindMatch ? kindMatch[1].toLowerCase() : "manifest";
      const name = nameMatch ? nameMatch[1] : `resource-${files.length}`;
      const fileName = `${kind}-${name}.yaml`;

      files.push({
        name: fileName,
        content: doc.trim() + "\n",
      });
    }

    // Also write the combined file
    files.push({
      name: "all-manifests.yaml",
      content: documents.map((d) => d.trim()).join("\n---\n") + "\n",
    });

    for (const file of files) {
      await writeFile(join(outDir, file.name), file.content, "utf-8");
    }

    return {
      title: `Generated K8s manifests for ${args.title}`,
      output: [
        `Application: ${args.title}`,
        `Output directory: ${outDir}`,
        "",
        ...files.map((f) => `  Created: ${f.name}`),
        "",
        "📋 To apply: kubectl apply -f " + outDir,
      ].join("\n"),
      metadata: {
        path: outDir,
        files: files.map((f) => f.name),
        resourceCount: documents.length,
      },
    };
  },
};

export default k8sTool;
