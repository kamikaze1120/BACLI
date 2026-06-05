import { z } from "zod";
import ExcelJS from "exceljs";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  title: z.string().describe("Spreadsheet title / filename"),
  sheets: z.array(z.object({
    name: z.string().describe("Sheet name"),
    headers: z.array(z.string()).describe("Column headers"),
    rows: z.array(z.array(z.string())).describe("Data rows (array of arrays)"),
  })).describe("Sheet definitions"),
  outputPath: z.string().optional().describe("Output path (default: ./output/<title>.xlsx)"),
});

const spreadsheetTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "spreadsheet",
  description: "Create Excel workbooks with multiple sheets, headers, and data rows.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    const outDir = join(process.cwd(), "output");
    if (!existsSync(outDir)) {
      await mkdir(outDir, { recursive: true });
    }

    const sanitized = args.title.replace(/[<>:"/\\|?*]/g, "_");
    const outputPath = args.outputPath || join(outDir, `${sanitized}.xlsx`);
    const outDirPath = dirname(outputPath);
    if (!existsSync(outDirPath)) {
      await mkdir(outDirPath, { recursive: true });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "bacli BA Agent";
    workbook.created = new Date();

    for (const sheetDef of args.sheets) {
      const sheet = workbook.addWorksheet(sheetDef.name.slice(0, 31));

      // Headers
      const headerRow = sheet.addRow(sheetDef.headers);
      headerRow.font = { bold: true, size: 11 };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
      headerRow.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };

      // Data rows
      for (const row of sheetDef.rows) {
        sheet.addRow(row);
      }

      // Auto-width columns
      sheet.columns.forEach((col, i) => {
        const maxLen = Math.max(
          (sheetDef.headers[i]?.length ?? 0),
          ...sheetDef.rows.map((r) => (r[i]?.length ?? 0))
        );
        col.width = Math.min(Math.max(maxLen + 2, 10), 50);
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    await writeFile(outputPath, Buffer.from(buffer));

    const totalRows = args.sheets.reduce((s, sh) => s + sh.rows.length, 0);
    return {
      title: `Created spreadsheet: ${args.title}`,
      output: `Saved to: ${outputPath}\nSheets: ${args.sheets.length}\nTotal rows: ${totalRows}`,
      metadata: { path: outputPath, sheets: args.sheets.length, rows: totalRows },
    };
  },
};

export default spreadsheetTool;
