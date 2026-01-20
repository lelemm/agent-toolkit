import { Daytona } from "@daytonaio/sdk";
import * as fs from "fs/promises";
import * as path from "path";

type ParsedEnv = Record<string, string>;

const ENV_FILE = path.resolve(process.cwd(), ".env");
const POLL_INTERVAL_MS = 2000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createSandboxFile = (content: string, name: string): File => {
  const FileCtor = (globalThis as typeof globalThis & { File?: typeof File }).File;
  if (!FileCtor) {
    throw new Error("File constructor is not available in this runtime.");
  }
  return new FileCtor([content], name, { type: "text/plain" });
};

const parseEnvFile = (content: string): ParsedEnv => {
  const result: ParsedEnv = {};
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sanitized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const idx = sanitized.indexOf("=");
    if (idx === -1) continue;
    const key = sanitized.slice(0, idx).trim();
    let value = sanitized.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
};

const loadEnvFromFile = async (): Promise<ParsedEnv | null> => {
  try {
    const content = await fs.readFile(ENV_FILE, "utf-8");
    const parsed = parseEnvFile(content);
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) process.env[key] = value;
    }
    return parsed;
  } catch {
    return null;
  }
};

const waitForClickUpToken = async (): Promise<string> => {
  while (true) {
    const parsed = await loadEnvFromFile();
    const token =
      parsed?.CLICKUP_TOKEN ??
      parsed?.clickup_token ??
      process.env.CLICKUP_TOKEN ??
      process.env.clickup_token;
    if (token) {
      process.env.CLICKUP_TOKEN = token;
      return token;
    }
    console.log("Waiting for CLICKUP_TOKEN in .env...");
    await sleep(POLL_INTERVAL_MS);
  }
};

const main = async () => {
  const clickupToken = await waitForClickUpToken();
  console.log("Loaded ClickUp token.");

  const daytona = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    serverUrl: process.env.DAYTONA_BASE_URL,
  });

  console.log("Creating sandbox...");
  const sandbox = await daytona.create({
    language: "typescript",
    envVars: { CLICKUP_TOKEN: clickupToken },
  });

  await sandbox.start();
  console.log(`Sandbox started: ${sandbox.id}`);

  const localSdkDir = path.resolve(process.cwd(), "..", "sdk");
  const sdkEntries = await fs.readdir(localSdkDir, { withFileTypes: true });
  await sandbox.fs.createFolder("workspace/sdk", "755");
  for (const entry of sdkEntries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".ts")) continue;
    const localPath = path.join(localSdkDir, entry.name);
    const source = await fs.readFile(localPath, "utf-8");
    await sandbox.fs.uploadFile(
      `workspace/sdk/${entry.name}`,
      createSandboxFile(source, entry.name)
    );
  }

  const fetchTaskScript = `
import { ClickUpClient } from "./sdk/clickup";

async function run() {
  const token = process.env.CLICKUP_TOKEN;
  if (!token) throw new Error("CLICKUP_TOKEN missing in sandbox env");
  const client = new ClickUpClient({ token });
  const task = await client.getTask("86aeggpdk");
  console.log(JSON.stringify(task, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

  await sandbox.fs.uploadFile(
    "workspace/fetch-task.ts",
    createSandboxFile(fetchTaskScript, "fetch-task.ts")
  );

  await sandbox.process.executeCommand("npm init -y", "workspace");
  await sandbox.process.executeCommand("npm install ts-node typescript", "workspace");
  const result = await sandbox.process.executeCommand("npx ts-node fetch-task.ts", "workspace");

  if (result.result) console.log(String(result.result).trim());
  if (result.exitCode !== 0) {
    console.error(`Command failed with exit code ${result.exitCode}.`);
  }

  await sandbox.stop();
  console.log("Sandbox stopped.");
};

main().catch((error) => {
  console.error("Example failed:", error);
  process.exit(1);
});
