import { z } from "zod";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  query: z.string().describe("The SQL query to analyze, generate, or explain"),
  operation: z.enum(["generate", "analyze", "explain", "optimize"]).describe("What to do with the SQL"),
  dialect: z.enum(["generic", "postgresql", "mysql", "sqlite", "mssql", "bigquery"]).optional().default("generic").describe("SQL dialect"),
});

const sqlTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "sql",
  description: "Generate, analyze, explain, or optimize SQL queries. Supports multiple SQL dialects.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    let output = "";

    switch (args.operation) {
      case "generate":
        output = generateSQL(args.query, args.dialect);
        break;
      case "analyze":
        output = analyzeSQL(args.query);
        break;
      case "explain":
        output = explainSQL(args.query);
        break;
      case "optimize":
        output = optimizeSQL(args.query, args.dialect);
        break;
    }

    return {
      title: `SQL ${args.operation}: ${args.query.slice(0, 50)}${args.query.length > 50 ? "..." : ""}`,
      output,
      metadata: { operation: args.operation, dialect: args.dialect },
    };
  },
};

function generateSQL(description: string, dialect: string): string {
  return [
    `Generated SQL (${dialect}):`,
    "",
    `-- Request: ${description}`,
    "-- Analysis and suggestions will be provided by the LLM based on this description.",
    "-- The LLM should generate the appropriate SQL based on the user's needs.",
    "",
    "/*",
    "The agent loop will handle this request by:",
    "1. Understanding the data model from context",
    "2. Generating the appropriate SQL query",
    "3. Explaining the query logic",
    "4. Providing sample output expectations",
    "*/",
  ].join("\n");
}

function analyzeSQL(query: string): string {
  const upper = query.toUpperCase();
  const clauses: string[] = [];

  if (upper.includes("SELECT")) clauses.push("SELECT: Data retrieval");
  if (upper.includes("FROM")) clauses.push("FROM: Source table(s)");
  if (upper.includes("WHERE")) clauses.push("WHERE: Filter conditions");
  if (upper.includes("JOIN")) clauses.push("JOIN: Table relationships");
  if (upper.includes("GROUP BY")) clauses.push("GROUP BY: Aggregation grouping");
  if (upper.includes("HAVING")) clauses.push("HAVING: Post-aggregation filter");
  if (upper.includes("ORDER BY")) clauses.push("ORDER BY: Result sorting");
  if (upper.includes("LIMIT") || upper.includes("TOP")) clauses.push("LIMIT/TOP: Result restriction");
  if (upper.includes("UNION")) clauses.push("UNION: Query combination");
  if (upper.includes("INSERT")) clauses.push("INSERT: Data insertion");
  if (upper.includes("UPDATE")) clauses.push("UPDATE: Data modification");
  if (upper.includes("DELETE")) clauses.push("DELETE: Data removal");
  if (upper.includes("CREATE")) clauses.push("CREATE: Object creation");
  if (upper.includes("ALTER")) clauses.push("ALTER: Schema modification");
  if (upper.includes("INDEX")) clauses.push("INDEX: Performance index");

  const tablePattern = /FROM\s+(\w+)|JOIN\s+(\w+)/gi;
  const tables = new Set<string>();
  let match;
  while ((match = tablePattern.exec(query)) !== null) {
    tables.add((match[1] || match[2]).toLowerCase());
  }

  return [
    "SQL Query Analysis:",
    "",
    `Length: ${query.length} characters`,
    `Clauses identified: ${clauses.length}`,
    "",
    "Clauses:",
    ...clauses.map((c) => `  - ${c}`),
    "",
    tables.size > 0 ? `Referenced tables: ${Array.from(tables).join(", ")}` : "No tables identified",
    "",
    "Structure:",
    "  " + (upper.includes("SELECT") ? "Read operation" : upper.includes("INSERT") || upper.includes("UPDATE") || upper.includes("DELETE") ? "Write operation" : "Unknown operation"),
  ].join("\n");
}

function explainSQL(query: string): string {
  return [
    "SQL Explanation:",
    "",
    query,
    "",
    "---",
    "",
    "This query will be explained by the LLM based on the specific context.",
    "The analysis above provides the structural breakdown.",
  ].join("\n");
}

function optimizeSQL(query: string, dialect: string): string {
  const suggestions: string[] = [];
  const upper = query.toUpperCase();

  if (upper.includes("SELECT *")) {
    suggestions.push("Consider selecting specific columns instead of '*' to reduce data transfer");
  }
  if (!upper.includes("WHERE") && upper.includes("SELECT") && !upper.includes("INSERT")) {
    suggestions.push("Query lacks WHERE clause — may scan entire table");
  }
  if (upper.includes("LIKE '%")) {
    suggestions.push("Leading wildcard in LIKE prevents index usage");
  }
  if (upper.includes("OR")) {
    suggestions.push("Consider using UNION/IN instead of OR for better index usage");
  }
  if (!upper.includes("LIMIT") && !upper.includes("TOP")) {
    suggestions.push("Consider adding LIMIT/TOP if not all results are needed");
  }
  if ((query.match(/JOIN/gi) || []).length > 3) {
    suggestions.push("Query has many JOINs — verify indexes on join columns");
  }
  if (upper.includes("NOT IN")) {
    suggestions.push("NOT IN can be slow with subqueries; consider NOT EXISTS or LEFT JOIN");
  }
  if (upper.includes("HAVING") && !upper.includes("GROUP BY")) {
    suggestions.push("HAVING without GROUP BY — consider using WHERE instead");
  }

  return [
    `SQL Optimization Suggestions (${dialect}):`,
    "",
    suggestions.length > 0
      ? suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "No specific optimization opportunities detected.",
    "",
    "Note: Actual performance depends on data volume, indexes, and execution plan.",
  ].join("\n");
}

export default sqlTool;
