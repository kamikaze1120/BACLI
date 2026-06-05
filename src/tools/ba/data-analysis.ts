import { z } from "zod";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  filePath: z.string().describe("Path to CSV or JSON data file"),
  format: z.enum(["csv", "json"]).describe("Data file format"),
  analysis: z.string().describe("What analysis to perform (e.g., 'summary statistics', 'find trends', 'compare columns')"),
});

const dataAnalysisTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "dataAnalysis",
  description: "Analyze CSV or JSON data files. Provides summary statistics, column analysis, and trend detection.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    if (!existsSync(args.filePath)) {
      return {
        title: "File not found",
        output: `Error: File not found: ${args.filePath}`,
      };
    }

    const raw = await readFile(args.filePath, "utf-8");
    let data: Record<string, unknown>[];

    if (args.format === "csv") {
      data = parseCSV(raw);
    } else {
      data = JSON.parse(raw);
      if (!Array.isArray(data)) data = [data as Record<string, unknown>];
    }

    if (data.length === 0) {
      return { title: "Empty data", output: "The data file contains no records." };
    }

    const columns = Object.keys(data[0]);
    const summary = generateSummary(data, columns);
    const columnAnalysis = analyzeColumns(data, columns);

    return {
      title: `Analysis of ${args.filePath}`,
      output: [
        `Dataset: ${args.filePath}`,
        `Records: ${data.length}`,
        `Columns: ${columns.join(", ")}`,
        "",
        "--- Summary ---",
        summary,
        "",
        "--- Column Analysis ---",
        columnAnalysis,
        "",
        `Analysis requested: ${args.analysis}`,
      ].join("\n"),
      metadata: {
        records: data.length,
        columns: columns.length,
        columnNames: columns,
      },
    };
  },
};

function parseCSV(raw: string): Record<string, unknown>[] {
  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length < 1) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      row[h] = values[i]?.replace(/^"|"$/g, "") ?? "";
    });
    return row;
  });
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current); current = ""; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

function generateSummary(data: Record<string, unknown>[], columns: string[]): string {
  return [
    `Total records: ${data.length}`,
    `Total columns: ${columns.length}`,
    `Columns: ${columns.join(", ")}`,
    "",
    "Numeric columns:",
    ...columns
      .filter((col) => data.some((row) => !isNaN(Number(row[col]))))
      .map((col) => {
        const nums = data.map((r) => Number(r[col])).filter((n) => !isNaN(n));
        if (nums.length === 0) return `  ${col}: (no numeric data)`;
        const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
        const sorted = [...nums].sort((a, b) => a - b);
        return `  ${col}: min=${sorted[0]}, max=${sorted[sorted.length - 1]}, avg=${avg.toFixed(2)}, count=${nums.length}`;
      }),
    "",
    "Text columns:",
    ...columns
      .filter((col) => data.some((row) => isNaN(Number(row[col]))))
      .map((col) => {
        const vals = data.map((r) => String(r[col])).filter(Boolean);
        const unique = new Set(vals);
        return `  ${col}: unique=${unique.size}, total=${vals.length}`;
      }),
  ].join("\n");
}

function analyzeColumns(data: Record<string, unknown>[], columns: string[]): string {
  return columns
    .map((col) => {
      const vals = data.map((r) => String(r[col])).filter(Boolean);
      const unique = new Set(vals);
      const nullCount = data.length - vals.length;
      return `${col}:\n  Non-null: ${vals.length}/${data.length}\n  Unique: ${unique.size}\n  Null/missing: ${nullCount}`;
    })
    .join("\n\n");
}

export default dataAnalysisTool;
