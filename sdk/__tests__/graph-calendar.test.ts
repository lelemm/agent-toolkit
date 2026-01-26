import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { GraphCalendarClient, DeviceCodeAuthRequiredError } from "../calendar";
import { createMockFetch, jsonResponse } from "./test_utils";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("GraphCalendarClient", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temp directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "graph-test-"));
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it("sends bearer auth and maps listEvents query to Graph $ params when token exists", async () => {
    // Pre-create valid access token file (mock JWT with exp in future)
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const mockToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.${btoa(JSON.stringify({ exp: futureExp })).replace(/=/g, "")}.sig`;
    await fs.writeFile(path.join(testDir, ".access_token"), mockToken);

    const { fetchImpl, calls } = createMockFetch(() => jsonResponse({ value: [] }, { status: 200 }));

    const client = new GraphCalendarClient({
      auth: { clientId: "test-client-id" },
      baseUrl: "https://graph.test/v1.0",
      tokenStorage: { dir: testDir },
      fetchImpl,
    });

    await client.listEvents(undefined, { top: 10, skip: 5, filter: "subject eq 'x'" });

    expect(calls).toHaveLength(1);
    const req = calls[0]!;
    const u = new URL(req.url);
    expect(u.origin + u.pathname).toBe("https://graph.test/v1.0/me/events");
    expect(u.searchParams.get("$top")).toBe("10");
    expect(u.searchParams.get("$skip")).toBe("5");
    expect(u.searchParams.get("$filter")).toBe("subject eq 'x'");

    const headers = req.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${mockToken}`);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("creates an event with POST body JSON when token exists", async () => {
    // Pre-create valid access token file
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const mockToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.${btoa(JSON.stringify({ exp: futureExp })).replace(/=/g, "")}.sig`;
    await fs.writeFile(path.join(testDir, ".access_token"), mockToken);

    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ id: "e1", subject: "Hi" }, { status: 200 })
    );

    const client = new GraphCalendarClient({
      auth: { clientId: "test-client-id" },
      baseUrl: "https://graph.test/v1.0",
      tokenStorage: { dir: testDir },
      fetchImpl,
    });

    const created = await client.createEvent(undefined, {
      subject: "Hi",
      body: { contentType: "text", content: "Hello" },
    });

    expect(created.id).toBe("e1");
    const req = calls[0]!;
    expect(req.init?.method).toBe("POST");
    expect(req.init?.body).toBe(JSON.stringify({ subject: "Hi", body: { contentType: "text", content: "Hello" } }));
  });

  it("throws DeviceCodeAuthRequiredError when no token exists", async () => {
    const { fetchImpl } = createMockFetch(() =>
      jsonResponse({
        device_code: "device-123",
        user_code: "ABCD1234",
        verification_uri: "https://microsoft.com/devicelogin",
        verification_uri_complete: "https://microsoft.com/devicelogin?code=ABCD1234",
        expires_in: 900,
        interval: 5,
        message: "To sign in, use a web browser...",
      }, { status: 200 })
    );

    const client = new GraphCalendarClient({
      auth: { clientId: "test-client-id" },
      baseUrl: "https://graph.test/v1.0",
      tokenStorage: { dir: testDir },
      fetchImpl,
    });

    await expect(client.listEvents()).rejects.toThrow(DeviceCodeAuthRequiredError);

    try {
      await client.listEvents();
    } catch (e) {
      expect(e).toBeInstanceOf(DeviceCodeAuthRequiredError);
      const err = e as DeviceCodeAuthRequiredError;
      expect(err.userCode).toBe("ABCD1234");
      expect(err.verificationUri).toBe("https://microsoft.com/devicelogin");
    }
  });
});

