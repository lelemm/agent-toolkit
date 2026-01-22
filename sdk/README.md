# Agent Toolkit SDK (demo-ready)

This folder is a small TypeScript SDK you can use inside agent workflows.

It includes:
- `ClickUpClient` (ClickUp API v2)
- `VikunjaClient` (Vikunja API)
- `GraphCalendarClient` (Microsoft Graph Calendar + device-code auth helpers)
- `TimeTrackingClient` (time-tracking API client)
- `secrets` helpers (read typed env vars)
- `policy` helpers (timezone/business-hours helpers)

## Quickstart

```bash
cd sdk
npm install
npm test
npm run build
```

## Deno usage (direct TypeScript import)

If you import these `.ts` files directly from Deno, `sdk/deno.json` provides an import map so bare imports like `luxon` resolve correctly via npm.

## Runnable demo (no credentials)

```bash
cd sdk
npm install
npm run build
node dist/demo.js
```

## Usage examples

### ClickUp (real API)

```ts
import { ClickUpClient } from "agent-toolkit-sdk";

const client = new ClickUpClient({ token: process.env.CLICKUP_TOKEN! });
const task = await client.getTask("123");
console.log(task.name);
```

### ClickUp (mocked fetch; runs offline)

```ts
import { ClickUpClient } from "agent-toolkit-sdk";

const mockFetch = (async () => new Response(JSON.stringify({ id: "t1", name: "Demo task" }))) as unknown as typeof fetch;
const client = new ClickUpClient({ token: "demo", fetchImpl: mockFetch });

console.log(await client.getTask("t1"));
```

### Graph calendar (device-code flow)

```ts
import { GraphCalendarClient } from "agent-toolkit-sdk";

const graph = new GraphCalendarClient({
  auth: { clientId: process.env.GRAPH_CLIENT_ID! }
});

const start = await graph.startDeviceCodeLogin();
console.log(start.message ?? `${start.verificationUri} (code: ${start.userCode})`);

// Call this explicitly until it returns { status: "completed" }
const check = await graph.checkDeviceCodeResult(start.deviceCode);
console.log(check);
```

