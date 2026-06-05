import { z } from "zod";
import { Client } from "ssh2";
import type { ToolDef, ToolContext, ExecuteResult } from "../tool.js";

const Parameters = z.object({
  host: z.string().describe("Remote host address"),
  port: z.number().optional().default(22).describe("SSH port"),
  username: z.string().describe("SSH username"),
  command: z.string().describe("Command to execute on the remote host"),
  authMethod: z.enum(["password", "key"]).optional().default("key").describe("Authentication method"),
  password: z.string().optional().describe("Password (if authMethod is 'password')"),
  keyPath: z.string().optional().describe("Path to SSH private key (if authMethod is 'key')"),
});

const sshTool: ToolDef<z.infer<typeof Parameters>> = {
  id: "ssh",
  description: "Execute commands on remote systems over SSH. Requires explicit permission before each use.",
  parameters: Parameters,

  async execute(args, ctx: ToolContext): Promise<ExecuteResult> {
    const allowed = await ctx.ask({
      tool: "ssh",
      pattern: `${args.username}@${args.host}:${args.port}`,
      action: "ask",
    });

    if (!allowed) {
      return {
        title: "SSH rejected",
        output: "Permission denied: SSH execution was not approved.",
      };
    }

    return new Promise((resolve) => {
      const conn = new Client();
      let stdout = "";
      let stderr = "";

      conn.on("ready", () => {
        conn.exec(args.command, (err, stream) => {
          if (err) {
            conn.end();
            resolve({
              title: "SSH execution failed",
              output: `Error executing command: ${err.message}`,
            });
            return;
          }

          stream.on("data", (data: Buffer) => { stdout += data.toString(); });
          stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

          stream.on("close", (code: number | null) => {
            conn.end();
            const output = stdout || stderr || "(no output)";
            resolve({
              title: `SSH: ${args.command.slice(0, 50)}`,
              output: `${output}${code !== null ? `\n\nExit code: ${code}` : ""}`,
              metadata: { host: args.host, exitCode: code },
            });
          });
        });
      });

      conn.on("error", (err) => {
        resolve({
          title: "SSH connection failed",
          output: `Error connecting to ${args.host}:${args.port} — ${err.message}`,
        });
      });

      const connectConfig: import("ssh2").ConnectConfig = {
        host: args.host,
        port: args.port,
        username: args.username,
        readyTimeout: 10000,
      };

      if (args.authMethod === "password" && args.password) {
        connectConfig.password = args.password;
      } else if (args.authMethod === "key") {
        // Use default key or specified key path
        connectConfig.agent = process.env.SSH_AUTH_SOCK;
      }

      conn.connect(connectConfig);
    });
  },
};

export default sshTool;
