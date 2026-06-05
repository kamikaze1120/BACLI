import { createServer, type IncomingMessage, type ServerResponse } from "http";
import type { BacliConfig } from "../../config/schema.js";
import type { GlobalBus } from "../../bus/event-bus.js";
import type { Storage } from "../../storage/index.js";
import { listSessions, getMessages } from "../../storage/messages.js";

export interface ServerOptions {
  config: BacliConfig;
  bus: GlobalBus;
  storage: Storage;
  port: number;
}

export async function startServer(options: ServerOptions): Promise<void> {
  const { bus, storage, port } = options;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    // SSE endpoint for real-time events
    if (url.pathname === "/events" || url.pathname === "/global/event") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const unsubLog = bus.on("log", (data) => {
        res.write(`data: ${JSON.stringify({ kind: "log", ...data })}\n\n`);
      });
      const unsubText = bus.on("text:delta", (data) => {
        res.write(`data: ${JSON.stringify({ kind: "text:delta", ...data })}\n\n`);
      });
      const unsubTool = bus.on("tool:status", (data) => {
        res.write(`data: ${JSON.stringify({ kind: "tool:status", ...data })}\n\n`);
      });
      const unsubPermission = bus.on("permission:request", (data) => {
        res.write(`data: ${JSON.stringify({ kind: "permission:request", ...data })}\n\n`);
      });
      const unsubSession = bus.on("session", (data) => {
        res.write(`data: ${JSON.stringify({ kind: "session", ...data })}\n\n`);
      });

      req.on("close", () => {
        unsubLog();
        unsubText();
        unsubTool();
        unsubPermission();
        unsubSession();
      });

      return;
    }

    // REST API endpoints
    if (req.method === "GET") {
      if (url.pathname === "/sessions") {
        const sessions = listSessions(storage);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(sessions));
        return;
      }

      const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
      if (sessionMatch) {
        const messages = getMessages(storage, sessionMatch[1]);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(messages));
        return;
      }

      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
        return;
      }
    }

    // Handle permission responses via POST
    if (req.method === "POST" && url.pathname === "/permission/response") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          bus.emit("permission:response", {
            id: data.id,
            tool: data.tool,
            pattern: data.pattern,
            action: "ask",
            resolved: true,
            approved: data.approved,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, () => {
    console.log(`bacli server running on http://localhost:${port}`);
    console.log(`SSE events at http://localhost:${port}/events`);
  });
}
