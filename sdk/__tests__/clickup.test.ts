import { describe, expect, it } from "vitest";
import { ClickUpClient } from "../clickup";
import { createMockFetch, jsonResponse, textResponse } from "./test_utils";

describe("ClickUpClient", () => {
  it("sends auth header and builds query params (including arrays)", async () => {
    const { fetchImpl, calls } = createMockFetch(() =>
      jsonResponse({ tasks: [{ id: "t1", name: "Task 1" }] }, { status: 200 })
    );

    const client = new ClickUpClient({
      token: "token-123",
      baseUrl: "https://clickup.test/api/v2",
      fetchImpl,
    });

    const res = await client.listTasks("list-1", {
      archived: true,
      statuses: ["open", "closed"],
      assignees: [10, 20],
    });

    expect(res.tasks).toHaveLength(1);
    expect(calls).toHaveLength(1);

    const req = calls[0]!;
    const u = new URL(req.url);
    expect(u.origin + u.pathname).toBe("https://clickup.test/api/v2/list/list-1/task");
    expect(u.searchParams.get("archived")).toBe("true");
    expect(u.searchParams.getAll("statuses")).toEqual(["open", "closed"]);
    expect(u.searchParams.getAll("assignees")).toEqual(["10", "20"]);

    expect(req.init?.method).toBe("GET");
    const headers = req.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("token-123");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(req.init?.body).toBeUndefined();
  });

  it("throws error message from ClickUp error payload", async () => {
    const { fetchImpl } = createMockFetch(() => jsonResponse({ err: "nope" }, { status: 401 }));
    const client = new ClickUpClient({ token: "x", baseUrl: "https://clickup.test/api/v2", fetchImpl });
    await expect(client.getTask("123")).rejects.toThrow("nope");
  });

  it("falls back to status/statusText when body isn't JSON", async () => {
    const { fetchImpl } = createMockFetch(() => textResponse("not json", { status: 500, statusText: "Oops" }));
    const client = new ClickUpClient({ token: "x", baseUrl: "https://clickup.test/api/v2", fetchImpl });
    await expect(client.getTask("123")).rejects.toThrow("500 Oops");
  });

  it("returns undefined for 204 responses", async () => {
    const { fetchImpl } = createMockFetch(() => new Response(null, { status: 204 }));
    const client = new ClickUpClient({ token: "x", baseUrl: "https://clickup.test/api/v2", fetchImpl });
    await expect(client.listViews("l1")).resolves.toBeUndefined();
  });
});

