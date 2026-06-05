import { z } from "zod";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  filePath: z.string().describe("The absolute path to the file to edit"),
  oldString: z.string().describe("The text to search for and replace"),
  newString: z.string().describe("The text to replace it with"),
  replaceAll: z.boolean().optional().describe("Replace all occurrences (default false)"),
});

const editTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "edit",
  description: "Edit a file by finding and replacing text. Uses multiple matching strategies for robustness.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    if (!existsSync(args.filePath)) {
      return {
        title: "File not found",
        output: `Error: File not found: ${args.filePath}`,
      };
    }

    const content = await readFile(args.filePath, "utf-8");
    const result = replace(content, args.oldString, args.newString, args.replaceAll ?? false);

    if (!result.found) {
      return {
        title: "Text not found",
        output: `Could not find the specified text in ${args.filePath}. Tried ${result.attempts} matching strategies.`,
        metadata: { strategies: result.attempts },
      };
    }

    await writeFile(args.filePath, result.content, "utf-8");

    return {
      title: `Edited ${args.filePath}`,
      output: `Successfully replaced text in ${args.filePath} (${result.replacements} replacement(s))`,
      metadata: {
        path: args.filePath,
        replacements: result.replacements,
        strategy: result.strategy,
      },
    };
  },
};

// 9 matching strategies (replicating Opencode's approach)
interface ReplaceResult {
  found: boolean;
  content: string;
  replacements: number;
  attempts: number;
  strategy: string;
}

function replace(content: string, oldStr: string, newStr: string, replaceAll: boolean): ReplaceResult {
  const strategies: Array<{ name: string; fn: () => { content: string; count: number } | null }> = [
    // 1. Exact match
    {
      name: "exact",
      fn: () => {
        if (replaceAll) {
          const count = (content.match(new RegExp(escapeRegex(oldStr), "g")) || []).length;
          return count > 0 ? { content: content.replaceAll(oldStr, newStr), count } : null;
        }
        const idx = content.indexOf(oldStr);
        if (idx === -1) return null;
        return { content: content.replace(oldStr, newStr), count: 1 };
      },
    },
    // 2. Trimmed lines match
    {
      name: "trimmed",
      fn: () => {
        const trimmed = oldStr.split("\n").map((l) => l.trim()).join("\n");
        const idx = content.indexOf(trimmed);
        if (idx === -1) return null;
        return { content: content.replace(trimmed, newStr), count: 1 };
      },
    },
    // 3. Whitespace normalized
    {
      name: "whitespace-normalized",
      fn: () => {
        const normalized = oldStr.replace(/\s+/g, " ").trim();
        const contentNormalized = content.replace(/\s+/g, " ").trim();
        const idx = contentNormalized.indexOf(normalized);
        if (idx === -1) return null;
        const actualMatch = content.slice(
          content.indexOf(contentNormalized.slice(idx, idx + normalized.length))
        );
        return null; // fall through
      },
    },
    // 4. Indentation flexible
    {
      name: "indentation-flexible",
      fn: () => {
        const minIndent = oldStr
          .split("\n")
          .filter((l) => l.trim())
          .reduce((min, l) => Math.min(min, l.length - l.trimLeft().length), Infinity);
        const dedented = oldStr
          .split("\n")
          .map((l) => l.slice(minIndent))
          .join("\n");
        const idx = content.indexOf(dedented);
        if (idx === -1) return null;
        return { content: content.replace(dedented, newStr), count: 1 };
      },
    },
    // 5. Escape normalized
    {
      name: "escape-normalized",
      fn: () => {
        const unescaped = oldStr
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\r/g, "\r");
        const idx = content.indexOf(unescaped);
        if (idx === -1) return null;
        return { content: content.replace(unescaped, newStr), count: 1 };
      },
    },
    // 6. Block anchor (first/last line as anchors)
    {
      name: "block-anchor",
      fn: () => {
        const lines = oldStr.split("\n");
        if (lines.length < 3) return null;
        const firstLine = lines[0].trim();
        const lastLine = lines[lines.length - 1].trim();
        const contentLines = content.split("\n");
        for (let i = 0; i < contentLines.length; i++) {
          if (contentLines[i].trim() === firstLine) {
            for (let j = i + 1; j < contentLines.length; j++) {
              if (contentLines[j].trim() === lastLine) {
                const block = contentLines.slice(i, j + 1).join("\n");
                const similarity = levenshteinSimilarity(oldStr, block);
                if (similarity > 0.65) {
                  const newBlock = contentLines.slice(0, i).join("\n") +
                    (i > 0 ? "\n" : "") + newStr +
                    (j < contentLines.length - 1 ? "\n" : "") +
                    contentLines.slice(j + 1).join("\n");
                  return { content: newBlock, count: 1 };
                }
              }
            }
          }
        }
        return null;
      },
    },
    // 7. Trimmed boundaries
    {
      name: "trimmed-boundary",
      fn: () => {
        const trimmedSearch = oldStr.trim();
        const trimmedContent = content.trim();
        const idx = trimmedContent.indexOf(trimmedSearch);
        if (idx === -1) return null;
        const fullIdx = content.indexOf(trimmedSearch);
        if (fullIdx === -1) return null;
        return { content: content.replace(trimmedSearch, newStr), count: 1 };
      },
    },
    // 8. Context-aware (first + last line anchors, middle approximate)
    {
      name: "context-aware",
      fn: () => {
        const lines = oldStr.split("\n");
        if (lines.length < 4) return null;
        const firstLine = lines[0].trim();
        const lastLine = lines[lines.length - 1].trim();
        const middleLines = lines.slice(1, -1);
        const contentLines = content.split("\n");
        for (let i = 0; i < contentLines.length; i++) {
          if (contentLines[i].trim() === firstLine) {
            for (let j = i + middleLines.length + 1; j < contentLines.length; j++) {
              if (contentLines[j].trim() === lastLine && j - i - 1 === middleLines.length) {
                const candidateMiddle = contentLines.slice(i + 1, j);
                const matchCount = middleLines.filter(
                  (ml, mi) => candidateMiddle[mi]?.trim() === ml.trim()
                ).length;
                if (matchCount / middleLines.length > 0.5) {
                  const newContent = contentLines.slice(0, i).join("\n") +
                    (i > 0 ? "\n" : "") + newStr +
                    (j < contentLines.length - 1 ? "\n" : "") +
                    contentLines.slice(j + 1).join("\n");
                  return { content: newContent, count: 1 };
                }
              }
            }
          }
        }
        return null;
      },
    },
    // 9. Multi-occurrence exact (for replaceAll)
    {
      name: "multi-occurrence",
      fn: () => {
        if (!replaceAll) return null;
        const matches = content.match(new RegExp(escapeRegex(oldStr), "g"));
        if (!matches || matches.length <= 1) return null;
        return { content: content.replaceAll(oldStr, newStr), count: matches.length };
      },
    },
  ];

  let attempts = 0;
  for (const strategy of strategies) {
    attempts++;
    const result = strategy.fn();
    if (result) {
      return {
        found: true,
        content: result.content,
        replacements: result.count,
        attempts,
        strategy: strategy.name,
      };
    }
  }

  return { found: false, content, replacements: 0, attempts, strategy: "none" };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function levenshteinSimilarity(a: string, b: string): number {
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export default editTool;
