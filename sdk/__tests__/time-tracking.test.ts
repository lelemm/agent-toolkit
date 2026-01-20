import { describe, expect, it } from "vitest";
import { TimeTrackingClient } from "../time_tracking";
import { createMockFetch, jsonResponse } from "./test_utils";

describe("TimeTrackingClient", () => {
  it("sets x-api-key and bearer auth headers when provided", async () => {
    const { fetchImpl, calls } = createMockFetch(() => jsonResponse({ entries: [] }, { status: 200 }));

    const client = new TimeTrackingClient({
      baseUrl: "https://tt.test",
      apiKey: "k123",
      bearerToken: "b123",
      fetchImpl,
    });

    await client.listTimeEntries();

    const headers = (calls[0]!.init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-api-key"]).toBe("k123");
    expect(headers.Authorization).toBe("Bearer b123");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("passes query params for searchClickUpTasks", async () => {
    const { fetchImpl, calls } = createMockFetch(() => jsonResponse({ tasks: [] }, { status: 200 }));

    const client = new TimeTrackingClient({ baseUrl: "https://tt.test", fetchImpl });
    await client.searchClickUpTasks("hello world");

    const u = new URL(calls[0]!.url);
    expect(u.origin + u.pathname).toBe("https://tt.test/api/clickup/tasks");
    expect(u.searchParams.get("q")).toBe("hello world");
  });
});

