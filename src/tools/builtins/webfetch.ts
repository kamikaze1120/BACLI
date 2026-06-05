import { z } from "zod";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  url: z.string().describe("The URL to fetch content from"),
  format: z.enum(["markdown", "text", "html"]).optional().default("markdown").describe("Response format"),
});

const webfetchTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "webfetch",
  description: "Fetch and parse content from a URL. Returns as formatted text, markdown, or HTML.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(args.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "bacli/0.1.0",
          "Accept": args.format === "html" ? "text/html" : "text/plain, text/markdown",
        },
      });

      if (!response.ok) {
        return {
          title: "Fetch failed",
          output: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const text = await response.text();
      const truncated = text.length > 10000 ? text.slice(0, 10000) + "\n... [truncated]" : text;

      return {
        title: `Fetched ${args.url}`,
        output: truncated,
        metadata: { url: args.url, contentType: response.headers.get("content-type"), length: text.length },
      };
    } catch (err) {
      return {
        title: "Fetch error",
        output: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};

export default webfetchTool;
