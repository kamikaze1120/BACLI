export interface AgentInfo {
  name: string;
  description: string;
  mode: "primary" | "subagent" | "all";
  hidden?: boolean;
  temperature?: number;
  topP?: number;
  steps?: number;
  prompt?: string;
}

export const builtinAgents: Record<string, AgentInfo> = {
  ba: {
    name: "ba",
    description: "Business Analyst agent for document generation, data analysis, and requirements gathering",
    mode: "primary",
  },
  sysadmin: {
    name: "sysadmin",
    description: "System Administrator agent for infrastructure, scripting, and configuration management",
    mode: "primary",
  },
};
