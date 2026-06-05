import type { ToolDef } from "./tool.js";
import type { BacliConfig } from "../config/schema.js";

// Lazy-load tool modules to keep startup fast
const toolModules: Record<string, () => Promise<{ default: ToolDef }>> = {
  // Builtins
  bash: () => import("./builtins/bash.js"),
  read: () => import("./builtins/read.js"),
  write: () => import("./builtins/write.js"),
  edit: () => import("./builtins/edit.js"),
  glob: () => import("./builtins/glob.js"),
  grep: () => import("./builtins/grep.js"),
  webfetch: () => import("./builtins/webfetch.js"),
  websearch: () => import("./builtins/websearch.js"),

  // BA tools
  document: () => import("./ba/document.js"),
  spreadsheet: () => import("./ba/spreadsheet.js"),
  diagram: () => import("./ba/diagram.js"),
  template: () => import("./ba/template.js"),
  dataAnalysis: () => import("./ba/data-analysis.js"),
  sql: () => import("./ba/sql.js"),

  // SysAdmin tools
  ssh: () => import("./sysadmin/ssh.js"),
  scriptGen: () => import("./sysadmin/script-gen.js"),
  docker: () => import("./sysadmin/docker.js"),
  k8s: () => import("./sysadmin/k8s.js"),
  terraform: () => import("./sysadmin/terraform.js"),
  network: () => import("./sysadmin/network.js"),
};

export const AGENT_TOOLS: Record<string, string[]> = {
  ba: [
    "bash", "read", "write", "edit", "glob", "grep", "webfetch", "websearch",
    "document", "spreadsheet", "diagram", "template", "dataAnalysis", "sql",
  ],
  sysadmin: [
    "bash", "read", "write", "edit", "glob", "grep", "webfetch", "websearch",
    "ssh", "scriptGen", "docker", "k8s", "terraform", "network",
  ],
};

const toolCache = new Map<string, ToolDef>();

export async function getToolDef(id: string): Promise<ToolDef | undefined> {
  if (toolCache.has(id)) return toolCache.get(id);

  const loader = toolModules[id];
  if (!loader) return undefined;

  const mod = await loader();
  toolCache.set(id, mod.default);
  return mod.default;
}

export async function resolveTools(
  agent: string,
  _model: string,
  _config: BacliConfig
): Promise<Record<string, ToolDef>> {
  const toolIDs = AGENT_TOOLS[agent] ?? AGENT_TOOLS.ba;
  const tools: Record<string, ToolDef> = {};

  for (const id of toolIDs) {
    const def = await getToolDef(id);
    if (def) {
      tools[id] = def;
    }
  }

  return tools;
}
