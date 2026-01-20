import { describe, expect, it } from "vitest";
import { GraphCalendarClient } from "../calendar";
import { createMockFetch, jsonResponse } from "./test_utils";

describe("GraphCalendarClient", () => {
  it("sends bearer auth and maps listEvents query to Graph $ params", async () => {
    const { fetchImpl, calls } = createMockFetch(() => jsonResponse({ value: [] }, { status: 200 }));

    const client = new GraphCalendarClient({
      accessToken: "access-123",
      baseUrl: "https://graph.test/v1.0",
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
    expect(headers.Authorization).toBe("Bearer access-123");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("creates an event with POST body JSON", async () => {
    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ id: "e1", subject: "Hi" }, { status: 200 })
    );

    const client = new GraphCalendarClient({
      accessToken: "access-123",
      baseUrl: "https://graph.test/v1.0",
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
});

