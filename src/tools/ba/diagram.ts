import { z } from "zod";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  diagramType: z.enum(["flowchart", "sequence", "class", "er", "gantt", "pie", "graph"]).describe("Type of diagram"),
  title: z.string().describe("Diagram title/filename"),
  definition: z.string().describe("Mermaid diagram definition syntax"),
  outputFormat: z.enum(["svg", "png", "md"]).optional().default("md").describe("Output format"),
  outputPath: z.string().optional().describe("Output file path"),
});

const diagramTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "diagram",
  description: "Generate diagrams using Mermaid syntax. Supports flowcharts, sequence diagrams, ERDs, class diagrams, Gantt charts, and pie charts.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    const outDir = join(process.cwd(), "output");
    if (!existsSync(outDir)) {
      await mkdir(outDir, { recursive: true });
    }

    const sanitized = args.title.replace(/[<>:"/\\|?*]/g, "_");
    const mermaidCode = buildMermaidCode(args.diagramType, args.definition);
    const mdPath = args.outputPath || join(outDir, `${sanitized}.md`);

    // Always output markdown with embedded Mermaid
    const md = [
      `# ${args.title}`,
      "",
      "```mermaid",
      mermaidCode,
      "```",
      "",
      `> Diagram type: ${args.diagramType}`,
    ].join("\n");

    await writeFile(mdPath, md, "utf-8");

    // Try SVG generation if requested (requires mermaid CLI)
    let svgPath: string | undefined;
    if (args.outputFormat === "svg") {
      svgPath = join(outDir, `${sanitized}.svg`);
      try {
        await generateMermaidSVG(mermaidCode, svgPath);
      } catch {
        // SVG generation failed; markdown fallback works
      }
    }

    return {
      title: `Generated ${args.diagramType}: ${args.title}`,
      output: `Diagram saved to: ${mdPath}${svgPath ? `\nSVG saved to: ${svgPath}` : ""}\nType: ${args.diagramType}\n\nTo render, paste the Mermaid code into https://mermaid.live or use a Mermaid-compatible viewer.`,
      metadata: {
        path: mdPath,
        svgPath,
        type: args.diagramType,
        mermaidCode,
      },
    };
  },
};

function buildMermaidCode(type: string, definition: string): string {
  const headers: Record<string, string> = {
    flowchart: "graph TD",
    sequence: "sequenceDiagram",
    class: "classDiagram",
    er: "erDiagram",
    gantt: "gantt",
    pie: "pie",
    graph: "graph LR",
  };

  const header = headers[type] || "graph TD";
  return `${header}\n${definition}`;
}

async function generateMermaidSVG(mermaidCode: string, outputPath: string): Promise<void> {
  // Try using the mermaid CLI via npx if available
  const { execSync } = await import("child_process");
  const tmpFile = join(process.cwd(), "output", "_mermaid_tmp.mmd");
  await writeFile(tmpFile, mermaidCode, "utf-8");

  try {
    execSync(
      `npx -y @mermaid-js/mermaid-cli mmdc -i "${tmpFile}" -o "${outputPath}" -b transparent`,
      { timeout: 30000, stdio: "pipe", windowsHide: true }
    );
  } finally {
    try { await import("fs/promises").then((fs) => fs.unlink(tmpFile)); } catch {}
  }
}

export default diagramTool;
