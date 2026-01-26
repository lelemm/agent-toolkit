import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { GraphPresenceAndMeetingClient, DeviceCodeAuthRequiredError } from "../presenceAndMeetingCreation";
import { createMockFetch, jsonResponse } from "./test_utils";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("GraphPresenceAndMeetingClient", () => {
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

  it("sends bearer auth when checking schedule (presence)", async () => {
    // Pre-create valid access token file (mock JWT with exp in future)
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const mockToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.${btoa(JSON.stringify({ exp: futureExp })).replace(/=/g, "")}.sig`;
    await fs.writeFile(path.join(testDir, ".access_token"), mockToken);

    const { fetchImpl, calls } = createMockFetch(() => jsonResponse({ value: [] }, { status: 200 }));

    const client = new GraphPresenceAndMeetingClient({
      auth: { clientId: "test-client-id" },
      baseUrl: "https://graph.test/v1.0",
      tokenStorage: { dir: testDir },
      fetchImpl,
    });

    await client.getSchedule({
      schedules: ["user@example.com"],
      startTime: { dateTime: "2024-01-15T09:00:00", timeZone: "UTC" },
      endTime: { dateTime: "2024-01-15T17:00:00", timeZone: "UTC" },
    });

    expect(calls).toHaveLength(1);
    const req = calls[0]!;
    const u = new URL(req.url);
    expect(u.origin + u.pathname).toBe("https://graph.test/v1.0/me/calendar/getSchedule");
    expect(req.init?.method).toBe("POST");

    const headers = req.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${mockToken}`);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("creates a meeting with POST body JSON when token exists", async () => {
    // Pre-create valid access token file
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const mockToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.${btoa(JSON.stringify({ exp: futureExp })).replace(/=/g, "")}.sig`;
    await fs.writeFile(path.join(testDir, ".access_token"), mockToken);

    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ id: "e1", subject: "Team Sync" }, { status: 200 })
    );

    const client = new GraphPresenceAndMeetingClient({
      auth: { clientId: "test-client-id" },
      baseUrl: "https://graph.test/v1.0",
      tokenStorage: { dir: testDir },
      fetchImpl,
    });

    const created = await client.createEvent(undefined, {
      subject: "Team Sync",
      body: { contentType: "text", content: "Weekly sync meeting" },
    });

    expect(created.id).toBe("e1");
    const req = calls[0]!;
    expect(req.init?.method).toBe("POST");
    expect(req.init?.body).toBe(JSON.stringify({ subject: "Team Sync", body: { contentType: "text", content: "Weekly sync meeting" } }));
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

    const client = new GraphPresenceAndMeetingClient({
      auth: { clientId: "test-client-id" },
      baseUrl: "https://graph.test/v1.0",
      tokenStorage: { dir: testDir },
      fetchImpl,
    });

    await expect(client.getSchedule({
      schedules: ["user@example.com"],
      startTime: { dateTime: "2024-01-15T09:00:00", timeZone: "UTC" },
      endTime: { dateTime: "2024-01-15T17:00:00", timeZone: "UTC" },
    })).rejects.toThrow(DeviceCodeAuthRequiredError);

    try {
      await client.getSchedule({
        schedules: ["user@example.com"],
        startTime: { dateTime: "2024-01-15T09:00:00", timeZone: "UTC" },
        endTime: { dateTime: "2024-01-15T17:00:00", timeZone: "UTC" },
      });
    } catch (e) {
      expect(e).toBeInstanceOf(DeviceCodeAuthRequiredError);
      const err = e as DeviceCodeAuthRequiredError;
      expect(err.userCode).toBe("ABCD1234");
      expect(err.verificationUri).toBe("https://microsoft.com/devicelogin");
    }
  });
});

