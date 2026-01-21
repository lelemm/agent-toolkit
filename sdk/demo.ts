import { ClickUpClient } from "./clickup.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

/**
 * Tiny runnable "demo" that does not require real credentials.
 * It uses a mocked `fetch` to show how the SDK clients are wired.
 *
 * Run:
 *   cd sdk
 *   npm i
 *   npm run build
 *   node dist/demo.js
 */
async function main() {
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    if (url.includes("/task/")) {
      return jsonResponse({ id: "demo-task", name: "Demo task from mocked fetch", status: { status: "open" } });
    }
    return jsonResponse({ ok: true });
  }) as unknown as typeof fetch;

  const client = new ClickUpClient({
    token: "demo-token",
    baseUrl: "https://api.clickup.local/api/v2",
    fetchImpl: fakeFetch,
  });

  const task = await client.getTask("123");
  console.log("ClickUpClient.getTask() demo:");
  console.log(JSON.stringify(task, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

