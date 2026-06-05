import { cosmiconfig } from "cosmiconfig";
import { defaultConfig } from "./defaults.js";
import { BacliConfigSchema, type BacliConfig } from "./schema.js";
import { join } from "path";
import { readFileSync } from "fs";

const explorer = cosmiconfig("bacli", {
  searchPlaces: [
    "bacli.config.json",
    "bacli.config.js",
    "bacli.config.ts",
    ".baclirc",
    ".baclirc.json",
    "package.json",
  ],
});

const globalExplorer = cosmiconfig("bacli", {
  searchPlaces: [
    ".baclirc.json",
    "bacli.config.json",
  ],
  stopDir: process.env.HOME || process.env.USERPROFILE,
});

export async function loadConfig(): Promise<BacliConfig> {
  const results: Record<string, unknown>[] = [];

  // 1. Global config
  const globalResult = await globalExplorer.search(
    process.env.HOME || process.env.USERPROFILE
  );
  if (globalResult?.config) {
    results.push(globalResult.config);
  }

  // 2. Project config
  const projectResult = await explorer.search();
  if (projectResult?.config) {
    results.push(projectResult.config);
  }

  // 3. Merge (project overrides global)
  const merged = Object.assign({}, defaultConfig, ...results);

  // 4. Environment variable overrides (check all common key vars)
  const keyVar = process.env.BACLI_API_KEY
    || process.env.OPENROUTER_API_KEY
    || process.env.DEEPSEEK_API_KEY
    || process.env.OPENAI_API_KEY
    || process.env.ANTHROPIC_API_KEY
    || "";
  if (keyVar) merged.apiKey = keyVar;
  if (process.env.BACLI_MODEL) merged.model = process.env.BACLI_MODEL;
  if (process.env.BACLI_PROVIDER) merged.provider = process.env.BACLI_PROVIDER;
  if (process.env.BACLI_BASE_URL) merged.baseUrl = process.env.BACLI_BASE_URL;
  if (process.env.OPENROUTER_BASE_URL) merged.baseUrl = process.env.OPENROUTER_BASE_URL;

  // 5. Validate
  const parsed = BacliConfigSchema.safeParse(merged);
  if (!parsed.success) {
    console.error("Config validation error:", parsed.error.format());
    return defaultConfig;
  }

  // Resolve env vars in apiKey
  const cfg = parsed.data;
  if (cfg.apiKey?.startsWith("${") && cfg.apiKey.endsWith("}")) {
    const envVar = cfg.apiKey.slice(2, -1);
    cfg.apiKey = process.env[envVar] || "";
  }

  // Fallback: check auth file at ~/.config/bacli/auth.json
  if (!cfg.apiKey) {
    try {
      const authPath = join(process.env.HOME || process.env.USERPROFILE || "", ".config", "bacli", "auth.json");
      const authData = JSON.parse(readFileSync(authPath, "utf-8"));
      if (authData.apiKey) cfg.apiKey = authData.apiKey;
      if (authData.provider) cfg.provider = authData.provider;
      if (authData.baseUrl) cfg.baseUrl = authData.baseUrl;
      if (authData.model) cfg.model = authData.model;
    } catch {}
  }

  return cfg;
}
