#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./config/index.js";
import { initStorage } from "./storage/index.js";
import { GlobalBus } from "./bus/event-bus.js";
import { renderTUI } from "./cli/tui/App.js";

const program = new Command();

program
  .name("bacli")
  .description("CLI agent for Business Analysts and System Administrators")
  .version("0.1.0");

program
  .argument("[prompt]", "Initial prompt for the BA agent")
  .option("-m, --model <model>", "Model ID to use")
  .option("-p, --provider <provider>", "Provider name")
  .action(async (prompt?: string, options?: { model?: string; provider?: string }) => {
    const config = await loadConfig();
    if (options?.model) config.model = options.model;
    if (options?.provider) config.provider = options.provider;

    // Store config for TUI
    process.env.BACLI_MODEL = config.model;
    process.env.BACLI_PROVIDER = config.provider;

    await renderTUI("ba", prompt);
  });

program
  .command("sysadmin")
  .description("Start System Administrator agent")
  .argument("[prompt]", "Initial prompt")
  .option("-m, --model <model>", "Model ID to use")
  .action(async (prompt?: string, options?: { model?: string }) => {
    const config = await loadConfig();
    if (options?.model) config.model = options.model;

    process.env.BACLI_MODEL = config.model;
    process.env.BACLI_PROVIDER = config.provider;

    await renderTUI("sysadmin", prompt);
  });

program
  .command("init")
  .description("Create .baclirc.json in current directory")
  .action(async () => {
    const template = JSON.stringify(
      {
        $schema: "https://bacli.dev/config.json",
        model: "deepseek-v4-flash",
        provider: "deepseek",
        apiKey: "${DEEPSEEK_API_KEY}",
        baseUrl: "https://api.deepseek.com",
      },
      null,
      2
    );
    const fs = await import("fs");
    await fs.promises.writeFile(".baclirc.json", template, "utf-8");
    console.log("Created .baclirc.json");
  });

program
  .command("config")
  .description("Manage configuration")
  .argument("[action]", "get or set")
  .argument("[key]", "Config key")
  .argument("[value]", "Config value")
  .action(async (action?: string, key?: string, value?: string) => {
    if (action === "get" && key) {
      const config = await loadConfig();
      console.log((config as any)[key] ?? "not set");
    } else if (action === "set" && key && value) {
      const cfgPath = ".baclirc.json";
      const fs = await import("fs");
      const existing = JSON.parse(await fs.promises.readFile(cfgPath, "utf-8").catch(() => "{}"));
      existing[key] = value;
      await fs.promises.writeFile(cfgPath, JSON.stringify(existing, null, 2));
      console.log(`Set ${key} = ${value}`);
    } else {
      console.log("Usage: bacli config <get|set> <key> [value]");
    }
  });

program
  .command("setup")
  .description("Interactive setup wizard — configure API key and provider")
  .action(async () => {
    const { default: chalk } = await import("chalk");
    const { createInterface } = await import("readline");
    const { join } = await import("path");
    const { writeFileSync, mkdirSync } = await import("fs");
    const { homedir } = await import("os");

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

    console.log(chalk.cyan("\n  ╔══════════════════════════════════════╗"));
    console.log(chalk.cyan("  ║        bacli Setup Wizard            ║"));
    console.log(chalk.cyan("  ╚══════════════════════════════════════╝\n"));
    console.log(chalk.white("  You need an API key to use AI models."));
    console.log(chalk.white("  Get a free key from OpenRouter (no CC needed):"));
    console.log(chalk.blue("  https://openrouter.ai/keys\n"));

    const apiKey = await ask(chalk.yellow("  Enter your API key: "));
    if (!apiKey.trim()) {
      console.log(chalk.red("\n  ✖ No API key entered. Run `bacli setup` again when ready.\n"));
      rl.close();
      return;
    }

    const model = await ask(chalk.yellow("  Model (default: deepseek-v4-flash): "));
    const provider = await ask(chalk.yellow("  Provider (default: deepseek): "));

    const authDir = join(homedir(), ".config", "bacli");
    mkdirSync(authDir, { recursive: true });
    writeFileSync(join(authDir, "auth.json"), JSON.stringify({
      apiKey: apiKey.trim(),
      model: model.trim() || "deepseek-v4-flash",
      provider: provider.trim() || "deepseek",
    }, null, 2), "utf-8");

    console.log(chalk.green("\n  ✓ Setup complete! API key saved to ~/.config/bacli/auth.json\n"));
    console.log(chalk.white("  Run `bacli` to start the agent.\n"));
    rl.close();
  });

program
  .command("serve")
  .description("Start HTTP server with SSE")
  .option("--port <port>", "Port number", "4096")
  .action(async (options: { port?: string }) => {
    const { startServer } = await import("./cli/server/Server.js");
    const config = await loadConfig();
    const bus = GlobalBus.getInstance();
    const storage = initStorage(config);
    await startServer({ config, bus, storage, port: parseInt(options.port ?? "4096") });
  });

program.parse(process.argv);
