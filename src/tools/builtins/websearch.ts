import { z } from "zod";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  query: z.string().describe("The search query"),
  numResults: z.number().optional().default(5).describe("Number of search results to return"),
});

const websearchTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "websearch",
  description: "Search the web for information. Returns relevant results with snippets.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    // Uses Google Custom Search API or DuckDuckGo as fallback
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CX;

    if (apiKey && cx) {
      try {
        const url = new URL("https://www.googleapis.com/customsearch/v1");
        url.searchParams.set("key", apiKey);
        url.searchParams.set("cx", cx);
        url.searchParams.set("q", args.query);
        url.searchParams.set("num", String(Math.min(args.numResults, 10)));

        const response = await fetch(url.toString());
        const data = await response.json() as { items?: Array<{ title: string; link: string; snippet: string }> };

        if (!data.items || data.items.length === 0) {
          return { title: "No results", output: `No search results for: ${args.query}` };
        }

        const results = data.items.map((item, i) =>
          `${i + 1}. ${item.title}\n   ${item.link}\n   ${item.snippet}`
        ).join("\n\n");

        return {
          title: `Search results for: ${args.query}`,
          output: results,
          metadata: { count: data.items.length },
        };
      } catch (err) {
        return {
          title: "Search failed",
          output: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // DuckDuckGo fallback (no API key needed)
    return searchDuckDuckGo(args.query, args.numResults);
  },
};

async function searchDuckDuckGo(query: string, numResults: number): Promise<ExecuteResult> {
  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { "User-Agent": "bacli/0.1.0" } }
    );

    if (!response.ok) {
      return { title: "Search failed", output: `Search engine returned ${response.status}` };
    }

    const data = await response.json() as { AbstractText?: string; RelatedTopics?: Array<{ Text?: string; FirstURL?: string }> };
    const parts: string[] = [];

    if (data.AbstractText) {
      parts.push(data.AbstractText);
    }

    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, numResults)) {
        if (topic.Text) parts.push(topic.Text);
      }
    }

    const output = parts.length > 0 ? parts.join("\n\n") : `No detailed results for: ${query}`;

    return {
      title: `Search: ${query}`,
      output,
      metadata: { source: "duckduckgo" },
    };
  } catch (err) {
    return {
      title: "Search failed",
      output: err instanceof Error ? err.message : String(err),
    };
  }
}

export default websearchTool;
