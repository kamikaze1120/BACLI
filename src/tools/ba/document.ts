import { z } from "zod";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, Header, Footer, PageNumber, AlignmentType } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  format: z.enum(["docx", "pdf", "md"] as const),
  title: z.string(),
  content: z.string(),
  outputPath: z.string().optional(),
});

const documentTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "document",
  description: "Generate professional documents in DOCX, PDF, or Markdown format. NEVER adds watermarks or branding.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    const outDir = join(process.cwd(), "output");
    if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

    const sanitized = args.title.replace(/[<>:"/\\|?*]/g, "_");
    const outputPath = args.outputPath || join(outDir, `${sanitized}.${args.format}`);
    const outDirPath = dirname(outputPath);
    if (!existsSync(outDirPath)) await mkdir(outDirPath, { recursive: true });

    switch (args.format) {
      case "docx":
        await generateDOCX(args.title, args.content, outputPath);
        break;
      case "pdf":
        await generatePDF(args.title, args.content, outputPath);
        break;
      case "md":
        await writeFile(outputPath, `# ${args.title}\n\n${args.content}`, "utf-8");
        break;
    }

    return {
      title: `Generated ${args.format.toUpperCase()}: ${args.title}`,
      output: `Document saved to: ${outputPath}\nFormat: ${args.format}\nTitle: ${args.title}`,
      metadata: { path: outputPath, format: args.format, title: args.title },
    };
  },
};

async function generateDOCX(title: string, content: string, outputPath: string): Promise<void> {
  const children = parseContentToDocxChildren(content);
  const doc = new Document({
    title,
    creator: "bacli BA Agent",
    styles: {
      default: {
        document: {
          run: { size: 22, font: "Calibri" },
          paragraph: { spacing: { after: 120 } },
        },
      },
    },
    sections: [{
      properties: {},
      headers: {
        default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: title, size: 18, color: "666666" })] })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }),
      },
      children: children as any,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  await writeFile(outputPath, new Uint8Array(buffer));
}

async function generatePDF(title: string, content: string, outputPath: string): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  let y = height - 50;
  const fontSize = 11;
  const lineHeight = fontSize * 1.4;
  const margin = 50;

  page.drawText(title, { x: margin, y, size: 18, font: boldFont, color: rgb(0, 0, 0.4) });
  y -= 30;

  const lines = content.split("\n");
  for (const line of lines) {
    if (y < 50) { page = pdfDoc.addPage([612, 792]); y = height - 50; }

    if (line.startsWith("## ")) {
      page.drawText(line.slice(3), { x: margin, y, size: 14, font: boldFont, color: rgb(0, 0, 0) });
      y -= lineHeight + 6;
    } else if (line.startsWith("# ")) {
      page.drawText(line.slice(2), { x: margin, y, size: 16, font: boldFont, color: rgb(0, 0, 0.3) });
      y -= lineHeight + 8;
    } else if (line.startsWith("- ")) {
      page.drawText(`  \u2022 ${line.slice(2)}`, { x: margin, y, size: fontSize, font });
      y -= lineHeight;
    } else if (line.trim()) {
      const words = line.split(" ");
      let lineText = "";
      for (const word of words) {
        const testLine = lineText ? `${lineText} ${word}` : word;
        if (font.widthOfTextAtSize(testLine, fontSize) > width - 2 * margin) {
          page.drawText(lineText, { x: margin, y, size: fontSize, font });
          y -= lineHeight;
          lineText = word;
          if (y < 50) { page = pdfDoc.addPage([612, 792]); y = height - 50; }
        } else {
          lineText = testLine;
        }
      }
      if (lineText) {
        page.drawText(lineText, { x: margin, y, size: fontSize, font });
        y -= lineHeight;
      }
    } else {
      y -= lineHeight / 2;
    }
  }

  const buffer = await pdfDoc.save();
  await writeFile(outputPath, Buffer.from(buffer));
}

function parseContentToDocxChildren(content: string): any[] {
  const children: any[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    if (line.startsWith("## ")) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: line.slice(3), bold: true, size: 26 })] }));
    } else if (line.startsWith("### ")) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: line.slice(4), bold: true, size: 24 })] }));
    } else if (line.startsWith("# ")) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: line.slice(2), bold: true, size: 28, color: "1F3864" })] }));
    } else if (line.startsWith("- ")) {
      children.push(new Paragraph({ spacing: { before: 60 }, bullet: { level: 0 }, children: [new TextRun({ text: line.slice(2), size: 22 })] }));
    } else if (line.match(/^\d+\.\s/)) {
      children.push(new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: line, size: 22 })] }));
    } else if (line.trim()) {
      children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }));
    } else {
      children.push(new Paragraph({ spacing: { before: 120 }, children: [] }));
    }
  }

  return children;
}

export default documentTool;
